import { pathToFileURL } from "node:url";

const REQUIRED = [
  ["status", "ok", "status ok"],
  ["mode", "configured", "mode configured"],
  ["dependencies.database", "ok", "database ok"],
  ["dependencies.redis", "ok", "redis ok"],
  ["capabilities.followGatedCampaigns", "enabled", "follow-gated enabled"],
];

// /api/health returns only `status` and `release` unless the caller presents
// HEALTH_DETAIL_TOKEN in this header.
const DETAIL_HEADER = "x-health-token";

function atPath(value, path) {
  return path.split(".").reduce((current, key) => current && current[key], value);
}

async function defaultWait() {
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}

function verifyDetail(body, expectedRelease) {
  for (const [path, expected, label] of REQUIRED) {
    if (atPath(body, path) !== expected) throw new Error(`production health requires ${label}`);
  }
  // Older releases do not report the worker; once present it must be beating.
  if (body.worker !== undefined && body.worker?.heartbeat !== "ok") {
    throw new Error("production health requires a live worker heartbeat");
  }
  if (expectedRelease) {
    if (body.release !== expectedRelease) {
      throw new Error(`production health expected web release ${expectedRelease}, received ${body.release ?? "none"}`);
    }
    if (body.worker !== undefined && body.worker.release !== expectedRelease) {
      throw new Error(`production health expected worker release ${expectedRelease}, received ${body.worker.release ?? "none"}`);
    }
  } else if (body.worker?.release && body.release && body.worker.release !== body.release) {
    throw new Error(`production web (${body.release}) and worker (${body.worker.release}) run different releases`);
  }
}

export async function checkProductionHealth({
  url,
  fetch: fetchFn = fetch,
  attempts = 3,
  wait = defaultWait,
  timeoutMs = 10_000,
  detailToken,
  expectedRelease,
}) {
  if (expectedRelease && !detailToken) {
    throw new Error("EXPECTED_RELEASE needs HEALTH_DETAIL_TOKEN: the public health response carries no release");
  }
  let lastError = new Error("health check did not run");
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const headers = { Accept: "application/json", "User-Agent": "Linkar-Production-Monitor/1.0" };
      if (detailToken) headers[DETAIL_HEADER] = detailToken;
      const response = await fetchFn(url, {
        headers,
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
      const hasDetail = body && typeof body === "object" && "mode" in body;
      if (hasDetail) {
        verifyDetail(body, expectedRelease);
      } else {
        if (detailToken) throw new Error("production health did not accept HEALTH_DETAIL_TOKEN");
        if (body?.status !== "ok") throw new Error("production health requires status ok");
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
    const result = await checkProductionHealth({
      url,
      detailToken: process.env.HEALTH_DETAIL_TOKEN || undefined,
      expectedRelease: process.env.EXPECTED_RELEASE || undefined,
    });
    console.log(`Production healthy${result.release ? ` · release ${result.release}` : ""}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
