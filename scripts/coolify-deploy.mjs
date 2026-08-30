// Deploys the current `main` HEAD to the Coolify Linkar service, following the
// procedure in ops/COOLIFY_DEPLOYMENT.md §4. Run this after pushing to main, once the
// "Build production container" workflow has published the image.
//
//   pnpm deploy:coolify
//   pnpm deploy:coolify -- --migrations-backed-up   (required when prisma/migrations changed)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const REPO = "linkar0912/main";
const WORKFLOW = "Build production container";
const STATE_FILE = ".coolify-deploy-state.json";
const POLL_INTERVAL_MS = 10_000;
const POLL_MAX_ATTEMPTS = 24; // ~4 minutes

function fail(stage, message, hint) {
  console.error(`\n✗ ${stage}: ${message}`);
  if (hint) console.error(`  → ${hint}`);
  process.exit(1);
}

function readEnvLocal() {
  const raw = readFileSync(".env.local", "utf8");
  const get = (key) => raw.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
  const env = {
    token: get("COOLIFY_API_TOKEN"),
    host: get("COOLIFY_HOST"),
    port: get("COOLIFY_PORT"),
    serviceUuid: get("COOLIFY_SERVICE_UUID"),
    publicDomain: get("PUBLIC_APP_DOMAIN"),
  };
  const missing = Object.entries(env).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) fail("Setup", `.env.local is missing: ${missing.join(", ")}`);
  return env;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function coolifyRequest(env, { method, path }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: env.host,
        port: Number(env.port),
        path,
        method,
        headers: { Authorization: `Bearer ${env.token}` },
        timeout: 15_000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("request timed out"));
    });
    req.end();
  });
}

function fetchPublic(path) {
  return new Promise((resolve, reject) => {
    const url = `https://${readEnvLocal().publicDomain}${path}`;
    https.get(url, { rejectUnauthorized: false, timeout: 15_000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    }).on("error", reject).on("timeout", function () {
      this.destroy();
      reject(new Error("request timed out"));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cssAssetPath(html) {
  return html.match(/\/_next\/static\/[a-zA-Z0-9/_-]+\.css/)?.[0] ?? null;
}

async function step1_verifyBuildIsGreen(headSha) {
  console.log(`\n[1/5] Checking "${WORKFLOW}" for commit ${headSha.slice(0, 7)}…`);
  let runs;
  try {
    const raw = execFileSync(
      "gh",
      ["run", "list", "--repo", REPO, "--workflow", WORKFLOW, "--json", "headSha,status,conclusion,url", "--limit", "20"],
      { encoding: "utf8" },
    );
    runs = JSON.parse(raw);
  } catch (error) {
    fail("Build check", `could not query GitHub Actions: ${error.message}`, "Is `gh` authenticated? Run `gh auth status`.");
  }
  const run = runs.find((r) => r.headSha === headSha);
  if (!run) {
    fail("Build check", `no "${WORKFLOW}" run found for this commit yet.`, "Push first, then wait for the workflow to start.");
  }
  if (run.status !== "completed") {
    fail("Build check", `the run is still "${run.status}".`, `Wait for it to finish: ${run.url}`);
  }
  if (run.conclusion !== "success") {
    fail("Build check", `the run concluded "${run.conclusion}" - do not deploy a failed build.`, run.url);
  }
  console.log(`  ✓ green: ${run.url}`);
}

function step2_checkMigrations(headSha, migrationsBackedUp) {
  console.log("\n[2/5] Checking for new Prisma migrations…");
  let lastDeployedSha = null;
  if (existsSync(STATE_FILE)) {
    lastDeployedSha = JSON.parse(readFileSync(STATE_FILE, "utf8")).lastDeployedSha;
  }
  if (!lastDeployedSha) {
    console.log("  ⚠ no deploy history on this machine - cannot diff migrations automatically.");
    if (!migrationsBackedUp) {
      fail(
        "Migration check",
        "no prior deploy recorded, so this could contain an unreleased migration.",
        "If you're sure it doesn't, or you've already backed up PostgreSQL, re-run with --migrations-backed-up.",
      );
    }
    return;
  }
  const changed = git(["diff", "--name-only", lastDeployedSha, headSha, "--", "prisma/migrations"]);
  if (changed) {
    console.log(`  ⚠ new migration files since the last deploy:\n${changed.split("\n").map((f) => `    ${f}`).join("\n")}`);
    if (!migrationsBackedUp) {
      fail(
        "Migration check",
        "this release adds Prisma migrations.",
        "Back up PostgreSQL (ops/COOLIFY_DEPLOYMENT.md §3), then re-run with --migrations-backed-up.",
      );
    }
  } else {
    console.log("  ✓ no new migrations since the last deploy.");
  }
}

async function step3_restart(env) {
  console.log("\n[3/5] Triggering restart…");
  const result = await coolifyRequest(env, { method: "POST", path: `/api/v1/services/${env.serviceUuid}/restart` });
  if (result.status !== 200) {
    fail("Restart", `Coolify returned HTTP ${result.status}: ${result.body}`);
  }
  console.log(`  ✓ ${result.body.trim()}`);
}

async function step4_pollStatus(env) {
  console.log("\n[4/5] Waiting for the rollout to settle (this takes ~60-90s and dips through a fully-down state)…");
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    const result = await coolifyRequest(env, { method: "GET", path: `/api/v1/services/${env.serviceUuid}` });
    let parsed;
    try {
      parsed = JSON.parse(result.body);
    } catch {
      console.log(`  [${attempt}/${POLL_MAX_ATTEMPTS}] non-JSON response (HTTP ${result.status}), retrying…`);
      continue;
    }
    const rows = [...(parsed.applications ?? []), ...(parsed.databases ?? [])];
    console.log(`  [${attempt}/${POLL_MAX_ATTEMPTS}] ${rows.map((r) => `${r.name}: ${r.status}`).join(", ")}`);
    const web = rows.find((r) => r.name === "web");
    if (web && String(web.status).includes("running:healthy")) {
      console.log("  ✓ web is running:healthy.");
      return;
    }
  }
  fail(
    "Rollout",
    `web never reached running:healthy after ${(POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s.`,
    "See the troubleshooting table in ops/COOLIFY_DEPLOYMENT.md - likely a stuck migration (§5) or a container that needs a force recreate.",
  );
}

async function step5_verifyExternally(beforeCss) {
  console.log("\n[5/5] Verifying from outside the container…");
  const health = await fetchPublic("/api/health");
  let healthBody;
  try {
    healthBody = JSON.parse(health.body);
  } catch {
    fail("External check", `/api/health did not return JSON: ${health.body.slice(0, 200)}`);
  }
  if (healthBody.status !== "ok") {
    fail("External check", `/api/health reports status "${healthBody.status}".`, JSON.stringify(healthBody));
  }
  console.log(`  ✓ /api/health: ok (database: ${healthBody.dependencies?.database}, redis: ${healthBody.dependencies?.redis})`);

  const loginPage = await fetchPublic("/login");
  const afterCss = cssAssetPath(loginPage.body);
  if (afterCss && beforeCss && afterCss !== beforeCss) {
    console.log(`  ✓ shipped a new build asset (${beforeCss} → ${afterCss}).`);
  } else if (afterCss && !beforeCss) {
    console.log(`  ✓ build asset present (${afterCss}); no pre-deploy baseline to compare against.`);
  } else {
    console.log(
      "  ⚠ build asset fingerprint did not change - this can be legitimate (no CSS changes this release) or a sign the deploy didn't take. Double check if unexpected.",
    );
  }
}

async function main() {
  const migrationsBackedUp = process.argv.includes("--migrations-backed-up");
  const headSha = git(["rev-parse", "HEAD"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") {
    fail("Setup", `you're on "${branch}", not main.`, "Merge to main first - production deploys from main only.");
  }

  const env = readEnvLocal();

  await step1_verifyBuildIsGreen(headSha);
  step2_checkMigrations(headSha, migrationsBackedUp);

  const before = await fetchPublic("/login").catch(() => ({ body: "" }));
  const beforeCss = cssAssetPath(before.body);

  await step3_restart(env);
  await step4_pollStatus(env);
  await step5_verifyExternally(beforeCss);

  writeFileSync(STATE_FILE, JSON.stringify({ lastDeployedSha: headSha, deployedAt: new Date().toISOString() }, null, 2));
  console.log(`\n✓ Deploy complete. ${headSha.slice(0, 7)} is live at https://${env.publicDomain}\n`);
}

main().catch((error) => fail("Unexpected error", error.stack ?? String(error)));
