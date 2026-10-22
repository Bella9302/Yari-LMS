// Seeds the E2E database and writes the fixture credentials to .e2e/fixtures.json.
// Run via tests/e2e/global-setup.ts (needs --conditions=react-server for server-only modules).
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { aad, encryptField } from "@/server/crypto/field-encryption";
import { issueToken } from "@/server/pii/users";
import { ensureTemplates } from "@/server/courses/templates";
import { createOrg, createUser } from "../support/factories";

const PASSWORD = "e2e passphrase for testing";

async function main() {
  const orgA = await createOrg("Acme Mining");
  const orgB = await createOrg("Beta Construction");
  await createUser({ roles: [{ role: "LEARNER" }], memberOf: [orgB.id], fullName: "Busisiwe Other-Company" });

  await ensureTemplates();
  const fixtures: Record<string, unknown> = { password: PASSWORD, orgA: orgA.name };

  async function withTotp(userId: string) {
    const key = randomBytes(20);
    await db.user.update({
      where: { id: userId },
      data: {
        totpSecretEnc: encryptField(key.toString("base64"), aad("User", "totpSecret", userId)),
        totpEnabledAt: new Date(),
      },
    });
    return key.toString("base64");
  }
  for (const project of ["mobile", "desktop"]) {
    const admin = await createUser({
      roles: [{ role: "SUPER_ADMIN" }],
      password: PASSWORD,
      fullName: `Ayanda Admin ${project}`,
    });
    const key = randomBytes(20);
    await db.user.update({
      where: { id: admin.id },
      data: {
        totpSecretEnc: encryptField(key.toString("base64"), aad("User", "totpSecret", admin.id)),
        totpEnabledAt: new Date(),
      },
    });
    const trainer = await createUser({
      roles: [{ role: "TRAINER" }],
      password: PASSWORD,
      fullName: `Tumi Trainer ${project}`,
    });
    const manager = await createUser({
      roles: [{ role: "CLIENT_MANAGER", organizationId: orgA.id }],
      password: PASSWORD,
      fullName: `Mpho Manager ${project}`,
    });
    const staff = await createUser({
      roles: [{ role: "LEARNER" }],
      memberOf: [orgA.id],
      fullName: `Sipho Staff ${project}`,
    });
    const builder = await createUser({
      roles: [{ role: "TRAINER" }],
      password: PASSWORD,
      fullName: `Bongani Builder ${project}`,
    });
    const builderKey = await withTotp(builder.id);
    const student = await createUser({
      roles: [{ role: "LEARNER" }],
      memberOf: [orgA.id],
      password: PASSWORD,
      fullName: `Zanele Student ${project}`,
    });
    const invitee = await createUser({
      roles: [{ role: "LEARNER" }],
      memberOf: [orgA.id],
      fullName: `Lerato Invitee ${project}`,
    });
    await db.user.update({ where: { id: invitee.id }, data: { status: "INVITED" } });
    const inviteToken = await db.$transaction((tx) => issueToken(tx, invitee.id, "INVITE", 86_400_000));

    fixtures[project] = {
      admin: { email: admin.email, totpKey: key.toString("base64") },
      trainer: { email: trainer.email },
      manager: { email: manager.email },
      staffName: staff.fullName,
      builder: { email: builder.email, totpKey: builderKey },
      student: { email: student.email, fullName: student.fullName },
      // Each project registers a different (valid) ID — the same one twice is rejected as a duplicate.
      invite: {
        token: inviteToken,
        email: invitee.email,
        idNumber: project === "mobile" ? "8001015009087" : "9202204720083",
      },
    };
  }

  mkdirSync(".e2e", { recursive: true });
  writeFileSync(".e2e/fixtures.json", JSON.stringify(fixtures, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
