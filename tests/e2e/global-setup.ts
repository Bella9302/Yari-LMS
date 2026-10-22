import { execSync } from "node:child_process";
import pg from "pg";
import { E2E_ENV } from "./env";

export default async function globalSetup() {
  const env = { ...process.env, ...E2E_ENV, TEST_DATABASE_URL: E2E_ENV.DATABASE_URL };
  const admin = new pg.Client({ connectionString: E2E_ENV.DATABASE_URL.replace(/\/[^/]+$/, "/postgres") });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'yari_e2e'");
  if (!exists.rowCount) await admin.query("CREATE DATABASE yari_e2e");
  await admin.end();

  const client = new pg.Client({ connectionString: E2E_ENV.DATABASE_URL });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();

  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx --conditions=react-server --import ./tests/support/env.ts tests/e2e/seed-e2e.ts", {
    stdio: "inherit",
    env,
  });
}
