import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  consumeToken,
  getUserDetail,
  inviteUser,
  peekToken,
  updateProfile,
  DuplicateIdNumberError,
} from "@/server/pii/users";
import { createOrg, createUser } from "../support/factories";

let admin: Awaited<ReturnType<typeof createUser>>;
let org: { id: string };

beforeAll(async () => {
  admin = await createUser({ roles: [{ role: "SUPER_ADMIN" }] });
  org = await createOrg();
});

describe("audit log", () => {
  it("records who viewed whose personal data, with field names but no values", async () => {
    const learner = await createUser({ roles: [{ role: "LEARNER" }] });
    await getUserDetail(admin, learner.id);
    const entry = await db.auditLog.findFirst({
      where: { action: "pii.viewed", actorId: admin.id, entityId: learner.id },
    });
    expect(entry?.fields).toContain("idNumber");
    expect(JSON.stringify(entry)).not.toContain(learner.email);
  });

  it("is append-only at the database level", async () => {
    const entry = await db.auditLog.create({ data: { action: "test", entityType: "Test" } });
    await expect(
      db.auditLog.update({ where: { id: entry.id }, data: { action: "tampered" } }),
    ).rejects.toThrow();
    await expect(db.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow();
    await expect(db.$executeRawUnsafe('TRUNCATE "AuditLog"')).rejects.toThrow();
  });
});

describe("invitations", () => {
  it("creates an invited user with an encrypted email and a single-use token", async () => {
    const result = await inviteUser(admin, {
      email: "New.Learner@Example.co.za",
      fullName: "New Learner",
      role: "LEARNER",
      organizationId: org.id,
    });
    expect(result.kind).toBe("invited");
    if (result.kind !== "invited") return;

    const user = await db.user.findUniqueOrThrow({
      where: { id: result.userId },
      include: { memberships: true },
    });
    expect(user.status).toBe("INVITED");
    expect(user.emailEnc).not.toContain("example");
    expect(user.memberships.map((m) => m.organizationId)).toEqual([org.id]);

    expect(await peekToken(result.token, "INVITE")).not.toBeNull();
    expect(await peekToken(result.token, "PASSWORD_RESET")).toBeNull();
    expect(await db.$transaction((tx) => consumeToken(tx, result.token, "INVITE"))).toBe(result.userId);
    expect(await db.$transaction((tx) => consumeToken(tx, result.token, "INVITE"))).toBeNull();
  });

  it("treats email case-insensitively and attaches existing accounts instead of duplicating", async () => {
    const existing = await createUser({ roles: [{ role: "LEARNER" }], email: "dup@example.co.za" });
    const result = await inviteUser(admin, {
      email: "DUP@example.co.za",
      fullName: "Dup",
      role: "LEARNER",
      organizationId: org.id,
    });
    expect(result).toEqual({ kind: "added-existing", userId: existing.id });
    expect(await db.orgMembership.count({ where: { userId: existing.id, organizationId: org.id } })).toBe(1);
  });

  it("issuing a new invite revokes the previous link", async () => {
    const first = await inviteUser(admin, {
      email: "twice@example.co.za",
      fullName: "Twice",
      role: "TRAINER",
    });
    const second = await inviteUser(admin, {
      email: "twice@example.co.za",
      fullName: "Twice",
      role: "TRAINER",
    });
    if (first.kind !== "invited" || second.kind !== "invited") throw new Error("expected invites");
    expect(await peekToken(first.token, "INVITE")).toBeNull();
    expect(await peekToken(second.token, "INVITE")).not.toBeNull();
  });
});

describe("ID number uniqueness", () => {
  it("rejects an ID already registered to someone else", async () => {
    await createUser({ roles: [{ role: "LEARNER" }], idNumber: "9202204720083" });
    const other = await createUser({ roles: [{ role: "LEARNER" }] });
    await expect(
      updateProfile(other, other.id, { idType: "SA_ID", idNumber: "920220 4720 083" }),
    ).rejects.toThrow(DuplicateIdNumberError);
  });
});
