// Daily jobs: at-risk evaluation, trainer digests, housekeeping.
// Run with: npm run jobs:nightly   (schedule it daily, e.g. 02:00 SAST, via cron or a systemd timer)
import "dotenv/config";
import { db } from "@/server/db";
import { runNightly } from "@/server/jobs/nightly";

runNightly()
  .then((r) => console.log(JSON.stringify({ at: new Date().toISOString(), ...r })))
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
