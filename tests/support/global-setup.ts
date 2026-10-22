import { execSync } from "node:child_process";
import pg from "pg";
import "./env";

/** Recreates the test database schema from migrations once per integration run. */
export default async function setup() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await client.end();
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
