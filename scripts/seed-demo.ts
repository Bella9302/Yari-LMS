// Demo data for showing YARI Academy to clients: two courses, an admin, two trainers, ten
// learners and a client company, with progress, marks, ratings and certificates.
// Run with: npm run db:seed:demo   (DEMO_PASSWORD=... to choose the shared password)
import "dotenv/config";
import { db } from "@/server/db";
import { seedDemo } from "@/server/demo/seed";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") {
    throw new Error(
      "Refusing to add demo data to a live site. Only demo servers (DEMO_MODE=true) can be seeded.",
    );
  }
  const logins = await seedDemo({ password: process.env.DEMO_PASSWORD });
  if (!logins) {
    console.log("Demo data is already in this database. Nothing to do.");
    return;
  }
  console.log(`\nDemo data created. Every account's password: ${logins.password}\n`);
  for (const p of logins.people) {
    console.log(`${p.role.padEnd(16)} ${p.name.padEnd(20)} ${p.email}`);
    if (p.totp) console.log(`${"".padEnd(16)} authenticator key: ${p.totp.manualKey}`);
  }
  console.log(
    "\nAdmins and trainers sign in with two-step verification: add their key to an authenticator app.\n" +
      "Demo emails use the .invalid domain, so nothing is sent to anyone.\n",
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
