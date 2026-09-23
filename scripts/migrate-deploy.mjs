import { spawnSync } from "node:child_process";

// Production migrations must run on the direct connection (port 5432): the
// pooled DATABASE_URL cannot take Prisma's advisory lock or run
// CREATE INDEX CONCURRENTLY. Prefer DIRECT_URL whenever it is set; fall back
// to DATABASE_URL for local development, which has no separate direct URL.
const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("migrate-deploy: set DIRECT_URL (production) or DATABASE_URL (local)");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
