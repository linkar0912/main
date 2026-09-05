import { pathToFileURL } from "node:url";

const REQUIRED = [
  ["status", "ok", "status ok"],
  ["mode", "configured", "mode configured"],
  ["dependencies.database", "ok", "database ok"],
  ["dependencies.redis", "ok", "redis ok"],
  ["capabilities.followGatedCampaigns", "enabled", "follow-gated enabled"],
];

function atPath(value, path) {
  return path.split(".").reduce((current, key) => current && current[key], value);
}

async function defaultWait() {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}

export async function checkProductionHealth({
  url,
  fetch: fetchFn = fetch,
  attempts = 3,
  wait = defaultWait,
  timeoutMs = 10_000,
}) {
  let lastError = new Error("health check did not run");
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchFn(url, {
        headers: { Accept: "application/json", "User-Agent": "Linkar-Production-Monitor/1.0" },
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`production health expected HTTP 200, received HTTP ${response.status}`);
      let body;
      try {
        body = await response.json();
      } catch {
        throw new Error("production health must return valid JSON");
      }
      for (const [path, expected, label] of REQUIRED) {
        if (atPath(body, path) !== expected) throw new Error(`production health requires ${label}`);
      }
      return { ok: true, release: typeof body.release === "string" ? body.release : null };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) await wait();
    }
  }
  throw lastError;
}

async function main() {
  const url = process.env.PRODUCTION_HEALTH_URL || "https://app.linkar.in/api/health";
  try {
    const result = await checkProductionHealth({ url });
    console.log(`Production healthy${result.release ? ` · release ${result.release}` : ""}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
