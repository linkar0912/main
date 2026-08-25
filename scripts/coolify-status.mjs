import { readFileSync } from "node:fs";
import http from "node:http";

const raw = readFileSync(".env.local", "utf8");
const get = (key) => raw.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
const env = {
  token: get("COOLIFY_API_TOKEN"),
  host: get("COOLIFY_HOST"),
  port: get("COOLIFY_PORT"),
  serviceUuid: get("COOLIFY_SERVICE_UUID"),
};

function request(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: env.host, port: Number(env.port), path, method: "GET", headers: { Authorization: `Bearer ${env.token}` }, timeout: 15_000 },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const service = await request(`/api/v1/services/${env.serviceUuid}`);
if (process.argv[2] === "restart") {
  const restart = await new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: env.host, port: Number(env.port), path: `/api/v1/services/${env.serviceUuid}/restart`, method: "POST", headers: { Authorization: `Bearer ${env.token}` }, timeout: 15_000 },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
  console.log("RESTART:", restart.status, restart.body.slice(0, 200));
} else {
const parsed = JSON.parse(service.body);
const rows = [...(parsed.applications ?? []), ...(parsed.databases ?? [])];
console.log("STATUS:", rows.map((r) => `${r.name}: ${r.status}`).join("\n       "));
for (const row of rows.filter((r) => r.name === "web" || r.name === "worker" || r.name === "migrate")) {
  const logs = await request(`/api/v1/services/${env.serviceUuid}/${row.name}/logs?tail=40`);
  console.log(`\n===== ${row.name} logs =====\n${logs.body.slice(-2500)}`);
}
}

