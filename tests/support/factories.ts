import { db } from "@/server/db";
import { emailIndex } from "@/server/crypto/blind-index";
import { hashPassword } from "@/server/crypto/password";
import { newId } from "@/server/crypto/tokens";
import { encryptProfile } from "@/server/pii/users";
import { enc } from "@/server/pii/fields";
import type { Role } from "@/generated/prisma/client";

let counter = 0;

export async function createOrg(name = `Company ${++counter}`) {
  return db.organization.create({
    data: { name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${newId().slice(0, 6)}` },
  });
}

export async function createUser(opts: {
  roles: { role: Role; organizationId?: string | null }[];
  memberOf?: string[];
  email?: string;
  fullName?: string;
  password?: string;
  idNumber?: string;
}) {
  const id = newId();
  const email = opts.email ?? `user${++counter}-${id.slice(0, 5)}@example.co.za`;
  const fullName = opts.fullName ?? `Test Person ${counter}`;
  await db.user.create({
    data: {
      id,
      emailEnc: enc.email(id, email),
      emailIdx: emailIndex(email),
      status: "ACTIVE",
      passwordHash: opts.password ? await hashPassword(opts.password) : null,
      profile: {
        create: {
          ...(encryptProfile(id, {
            fullName,
            ...(opts.idNumber ? { idType: "SA_ID" as const, idNumber: opts.idNumber } : {}),
          }) as { fullNameEnc: string }),
        },
      },
      roles: { create: opts.roles.map((r) => ({ role: r.role, organizationId: r.organizationId ?? null })) },
      memberships: {
        create: (opts.memberOf ?? []).map((organizationId) => ({ id: newId(), organizationId })),
      },
    },
  });
  const roles = await db.roleAssignment.findMany({
    where: { userId: id },
    select: { role: true, organizationId: true },
  });
  return { id, email, fullName, roles };
}
