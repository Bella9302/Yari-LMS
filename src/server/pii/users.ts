import "server-only";
import type { IdDocumentType, Role, UserStatus } from "@/generated/prisma/client";
import { db, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { emailIndex, idNumberIndex, normaliseEmail } from "@/server/crypto/blind-index";
import { generateToken, newId, sha256 } from "@/server/crypto/tokens";
import { dec, enc } from "@/server/pii/fields";
import { canAccessOrg, isSuperAdmin, managedOrgIds } from "@/server/rbac";
import type { RoleGrant } from "@/server/auth/session";
import { maskIdNumber } from "@/lib/identity-documents";

export const INVITE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export class PermissionError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "PermissionError";
  }
}

export interface Actor {
  id: string;
  roles: RoleGrant[];
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export interface InviteInput {
  email: string;
  fullName: string;
  role: Role;
  organizationId?: string | null;
  department?: string | null;
}

export type InviteResult =
  { kind: "invited"; userId: string; token: string } | { kind: "added-existing"; userId: string };

/** Throws PermissionError unless `actor` may grant `role` (in `organizationId`). */
export function assertCanInvite(actor: Actor, role: Role, organizationId: string | null | undefined) {
  if (role === "CLIENT_MANAGER" && !organizationId) {
    throw new PermissionError("A Client Manager must belong to a company.");
  }
  if (isSuperAdmin(actor.roles)) return;
  // Client Managers may only invite learners into the companies they manage.
  if (role === "LEARNER" && organizationId && managedOrgIds(actor.roles).includes(organizationId)) return;
  throw new PermissionError();
}

/**
 * Invites a person, or attaches the role/company to an existing account.
 * The caller is never told which happened when they are a Client Manager, so a
 * company can't probe whether someone already has an account elsewhere.
 */
export async function inviteUser(actor: Actor, input: InviteInput): Promise<InviteResult> {
  const organizationId = input.organizationId || null;
  assertCanInvite(actor, input.role, organizationId);
  const email = normaliseEmail(input.email);
  const emailIdx = emailIndex(email);

  return db.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { emailIdx }, select: { id: true, status: true } });
    const userId = existing?.id ?? newId();

    if (!existing) {
      await tx.user.create({
        data: {
          id: userId,
          emailEnc: enc.email(userId, email),
          emailIdx,
          status: "INVITED",
          invitedById: actor.id,
          profile: { create: { fullNameEnc: enc.fullName(userId, input.fullName.trim()) } },
        },
      });
    }

    await grantRole(tx, userId, input.role, input.role === "CLIENT_MANAGER" ? organizationId : null);
    if (organizationId && input.role === "LEARNER") {
      await ensureMembership(tx, userId, organizationId, input.department ?? null);
    }

    await audit(
      {
        actorId: actor.id,
        action: "user.invited",
        entityType: "User",
        entityId: userId,
        orgId: organizationId,
        fields: existing ? [] : ["email", "fullName"],
        meta: { role: input.role, existing: Boolean(existing) },
      },
      tx,
    );

    if (existing && existing.status !== "INVITED") return { kind: "added-existing" as const, userId };
    return {
      kind: "invited" as const,
      userId,
      token: await issueToken(tx, userId, "INVITE", INVITE_DAYS * DAY_MS),
    };
  });
}

async function grantRole(tx: Tx, userId: string, role: Role, organizationId: string | null) {
  const exists = await tx.roleAssignment.findFirst({ where: { userId, role, organizationId } });
  if (!exists) await tx.roleAssignment.create({ data: { userId, role, organizationId } });
}

async function ensureMembership(tx: Tx, userId: string, organizationId: string, department: string | null) {
  const exists = await tx.orgMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  if (!exists) {
    await tx.orgMembership.create({ data: { id: newId(), organizationId, userId, department } });
  }
}

export async function issueToken(
  tx: Tx,
  userId: string,
  type: "INVITE" | "PASSWORD_RESET",
  ttlMs: number,
): Promise<string> {
  // Only one live token of each type per user.
  await tx.authToken.deleteMany({ where: { userId, type, usedAt: null } });
  const token = generateToken();
  await tx.authToken.create({
    data: { id: sha256(token), userId, type, expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

/** Looks up a live token without consuming it. */
export async function peekToken(token: string, type: "INVITE" | "PASSWORD_RESET") {
  const row = await db.authToken.findUnique({ where: { id: sha256(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

/** Atomically marks a token used; returns the user id, or null if it was invalid or already used. */
export async function consumeToken(tx: Tx, token: string, type: "INVITE" | "PASSWORD_RESET") {
  const id = sha256(token);
  const { count } = await tx.authToken.updateMany({
    where: { id, type, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (count !== 1) return null;
  return (await tx.authToken.findUniqueOrThrow({ where: { id }, select: { userId: true } })).userId;
}

// ---------------------------------------------------------------------------
// Reading identities
// ---------------------------------------------------------------------------

export interface DisplayIdentity {
  id: string;
  email: string;
  fullName: string;
  preferredName: string | null;
  displayName: string;
}

/** The signed-in user's own name and email (not audit-logged: it's their own data). */
export async function getOwnIdentity(userId: string): Promise<DisplayIdentity> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, emailEnc: true, profile: { select: { fullNameEnc: true, preferredNameEnc: true } } },
  });
  return toIdentity(user);
}

function toIdentity(user: {
  id: string;
  emailEnc: string;
  profile: { fullNameEnc: string; preferredNameEnc: string | null } | null;
}): DisplayIdentity {
  const fullName = user.profile ? dec.fullName(user.id, user.profile.fullNameEnc) : "";
  const preferredName = user.profile ? dec.preferredName(user.id, user.profile.preferredNameEnc) : null;
  return {
    id: user.id,
    email: dec.email(user.id, user.emailEnc),
    fullName,
    preferredName,
    displayName: preferredName || fullName.split(" ")[0] || "there",
  };
}

export interface UserListRow extends DisplayIdentity {
  status: UserStatus;
  roles: RoleGrant[];
  organizations: { id: string; name: string }[];
  lastLoginAt: Date | null;
  totpEnabled: boolean;
}

/**
 * Users visible to `actor`: everyone for Super Admins, members of managed companies for Client Managers.
 * Names are encrypted, so text search happens after decryption (fine at YARI's scale).
 */
export async function listUsers(
  actor: Actor,
  filter: { q?: string; role?: Role; organizationId?: string; status?: UserStatus } = {},
): Promise<UserListRow[]> {
  const admin = isSuperAdmin(actor.roles);
  if (filter.organizationId && !canAccessOrg(actor.roles, filter.organizationId)) throw new PermissionError();
  if (!admin && !filter.organizationId) {
    const orgIds = managedOrgIds(actor.roles);
    if (orgIds.length === 0) throw new PermissionError();
  }

  const orgFilter = filter.organizationId ?? (admin ? undefined : { in: managedOrgIds(actor.roles) });
  const q = filter.q?.trim() ?? "";
  const looksLikeEmail = q.includes("@");

  const users = await db.user.findMany({
    where: {
      status: filter.status ?? { not: "DELETED" },
      ...(filter.role ? { roles: { some: { role: filter.role } } } : {}),
      ...(orgFilter ? { memberships: { some: { organizationId: orgFilter } } } : {}),
      ...(looksLikeEmail ? { emailIdx: emailIndex(q) } : {}),
    },
    select: {
      id: true,
      emailEnc: true,
      status: true,
      lastLoginAt: true,
      totpEnabledAt: true,
      profile: { select: { fullNameEnc: true, preferredNameEnc: true } },
      roles: { select: { role: true, organizationId: true } },
      memberships: {
        where: orgFilter ? { organizationId: orgFilter } : undefined,
        select: { organization: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  let rows: UserListRow[] = users.map((u) => ({
    ...toIdentity(u),
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    totpEnabled: u.totpEnabledAt != null,
    // Client Managers only see roles relevant to their company.
    roles: admin ? u.roles : u.roles.filter((r) => r.role === "LEARNER"),
    organizations: u.memberships.map((m) => m.organization),
  }));

  if (q && !looksLikeEmail) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) =>
      `${r.fullName} ${r.preferredName ?? ""} ${r.email}`.toLowerCase().includes(needle),
    );
  }

  await audit({
    actorId: actor.id,
    action: "pii.viewed",
    entityType: "UserList",
    orgId: filter.organizationId ?? null,
    fields: ["email", "fullName"],
    meta: { count: rows.length, filter: { ...filter, q: q ? "[search]" : undefined } },
  });

  return rows;
}

export interface UserDetail extends UserListRow {
  idType: IdDocumentType | null;
  idNumber: string | null;
  idNumberMasked: boolean;
  passportCountry: string | null;
  phone: string | null;
  address: string | null;
  employer: string | null;
  createdAt: Date;
}

/**
 * Full personal details for one user. ID numbers are masked on the server for
 * everyone except Super Admins. Every read is audit-logged.
 */
export async function getUserDetail(actor: Actor, userId: string): Promise<UserDetail | null> {
  const admin = isSuperAdmin(actor.roles);
  const self = actor.id === userId;
  const orgIds = admin ? undefined : managedOrgIds(actor.roles);

  const user = await db.user.findFirst({
    where: {
      id: userId,
      ...(admin || self ? {} : { memberships: { some: { organizationId: { in: orgIds } } } }),
    },
    include: {
      profile: true,
      roles: { select: { role: true, organizationId: true } },
      memberships: {
        where: admin || self ? undefined : { organizationId: { in: orgIds } },
        select: { organization: { select: { id: true, name: true } } },
      },
    },
  });
  if (!user || !user.profile) return null;

  const p = user.profile;
  const idNumber = dec.idNumber(user.id, p.idNumberEnc);
  const fields = ["email", "fullName", "preferredName", "idNumber", "phone", "address", "employer"];

  if (!self) {
    await audit({ actorId: actor.id, action: "pii.viewed", entityType: "User", entityId: user.id, fields });
  }

  return {
    ...toIdentity({ id: user.id, emailEnc: user.emailEnc, profile: p }),
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    totpEnabled: user.totpEnabledAt != null,
    roles: admin || self ? user.roles : user.roles.filter((r) => r.role === "LEARNER"),
    organizations: user.memberships.map((m) => m.organization),
    idType: p.idType,
    idNumber: idNumber && !admin ? maskIdNumber(idNumber) : idNumber,
    idNumberMasked: Boolean(idNumber) && !admin,
    passportCountry: p.passportCountry,
    phone: dec.phone(user.id, p.phoneEnc),
    address: dec.address(user.id, p.addressEnc),
    employer: dec.employer(user.id, p.employerEnc),
    createdAt: user.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Writing profiles
// ---------------------------------------------------------------------------

export interface ProfileInput {
  fullName?: string;
  preferredName?: string | null;
  phone?: string | null;
  address?: string | null;
  employer?: string | null;
  idType?: IdDocumentType | null;
  idNumber?: string | null;
  passportCountry?: string | null;
}

export class DuplicateIdNumberError extends Error {
  constructor() {
    super("That ID or passport number is already registered to another account.");
    this.name = "DuplicateIdNumberError";
  }
}

/** Builds the encrypted column values for a profile update. Undefined keys are left unchanged. */
export function encryptProfile(userId: string, input: ProfileInput) {
  const data: Record<string, string | null> = {};
  if (input.fullName !== undefined) data.fullNameEnc = enc.fullName(userId, input.fullName.trim());
  if (input.preferredName !== undefined)
    data.preferredNameEnc = enc.preferredName(userId, input.preferredName?.trim());
  if (input.phone !== undefined) data.phoneEnc = enc.phone(userId, input.phone?.trim());
  if (input.address !== undefined) data.addressEnc = enc.address(userId, input.address?.trim());
  if (input.employer !== undefined) data.employerEnc = enc.employer(userId, input.employer?.trim());
  if (input.idNumber !== undefined) {
    const value = input.idNumber?.replace(/\s/g, "") || null;
    data.idType = value ? (input.idType ?? null) : null;
    data.idNumberEnc = enc.idNumber(userId, value);
    data.passportCountry = value && input.idType === "PASSPORT" ? (input.passportCountry ?? null) : null;
    data.idNumberIdx =
      value && input.idType ? idNumberIndex(input.idType, value, input.passportCountry) : null;
  }
  return data;
}

export async function updateProfile(actor: Actor, userId: string, input: ProfileInput, tx: Tx = db) {
  if (actor.id !== userId && !isSuperAdmin(actor.roles)) throw new PermissionError();
  const data = encryptProfile(userId, input);
  if (data.idNumberIdx) {
    const clash = await tx.userProfile.findUnique({ where: { idNumberIdx: data.idNumberIdx } });
    if (clash && clash.userId !== userId) throw new DuplicateIdNumberError();
  }
  await tx.userProfile.update({ where: { userId }, data });
  await audit(
    {
      actorId: actor.id,
      action: "pii.updated",
      entityType: "User",
      entityId: userId,
      fields: Object.keys(input).filter((k) => input[k as keyof ProfileInput] !== undefined),
    },
    tx,
  );
}
