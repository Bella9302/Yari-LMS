// Bootstrap seed: creates the course templates and the first Super Admin (as a pending
// invitation, printing the link).
// Demo data (courses, learners, ratings) is added in Phase 7.
// Run with: npm run db:seed
import "dotenv/config";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { emailIndex, normaliseEmail } from "@/server/crypto/blind-index";
import { newId } from "@/server/crypto/tokens";
import { enc } from "@/server/pii/fields";
import { INVITE_DAYS, issueToken } from "@/server/pii/users";
import { ensureTemplates } from "@/server/courses/templates";

async function main() {
  const templates = await ensureTemplates();
  if (templates.length) console.log(`Created course templates: ${templates.join(", ")}`);

  const existingAdmin = await db.roleAssignment.findFirst({ where: { role: "SUPER_ADMIN" } });
  if (existingAdmin) {
    console.log("A Super Admin already exists — nothing to do.");
    return;
  }
  const email = normaliseEmail(process.env.SEED_ADMIN_EMAIL ?? `admin@${"yarigroup.co.za"}`);
  const fullName = process.env.SEED_ADMIN_NAME ?? "YARI Admin";

  const token = await db.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { emailIdx: emailIndex(email) } });
    if (!user) {
      const id = newId();
      user = await tx.user.create({
        data: {
          id,
          emailEnc: enc.email(id, email),
          emailIdx: emailIndex(email),
          profile: { create: { fullNameEnc: enc.fullName(id, fullName) } },
        },
      });
    }
    await tx.roleAssignment.create({ data: { userId: user.id, role: "SUPER_ADMIN" } });
    await tx.auditLog.create({
      data: {
        action: "user.invited",
        entityType: "User",
        entityId: user.id,
        meta: { role: "SUPER_ADMIN", via: "seed" },
      },
    });
    return issueToken(tx, user.id, "INVITE", INVITE_DAYS * 24 * 60 * 60 * 1000);
  });

  console.log(
    `\nSuper Admin invitation for ${email}:\n  ${env().APP_URL}/invite/${token}\n(valid ${INVITE_DAYS} days)\n`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
