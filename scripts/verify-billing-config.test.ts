import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./verify-billing-config.mjs", import.meta.url));
const required = [
  "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
  "RAZORPAY_PLAN_CREATOR_MONTHLY_ID", "RAZORPAY_PLAN_CREATOR_ANNUAL_ID",
  "RAZORPAY_PLAN_GROWTH_MONTHLY_ID", "RAZORPAY_PLAN_GROWTH_ANNUAL_ID",
  "RAZORPAY_PLAN_AGENCY_MONTHLY_ID", "RAZORPAY_PLAN_AGENCY_ANNUAL_ID",
] as const;

const completeEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "production",
  APP_URL: "https://app.linkar.in",
  WORKER_HEALTH_URL: "http://worker:3001/health",
  RAZORPAY_KEY_ID: "rzp_live_public_test_value",
  RAZORPAY_KEY_SECRET: "fake-key-secret-that-must-never-print",
  RAZORPAY_WEBHOOK_SECRET: "fake-webhook-secret-that-must-never-print",
  RAZORPAY_PLAN_CREATOR_MONTHLY_ID: "plan_creator_monthly_safe",
  RAZORPAY_PLAN_CREATOR_ANNUAL_ID: "plan_creator_annual_safe",
  RAZORPAY_PLAN_GROWTH_MONTHLY_ID: "plan_growth_monthly_safe",
  RAZORPAY_PLAN_GROWTH_ANNUAL_ID: "plan_growth_annual_safe",
  RAZORPAY_PLAN_AGENCY_MONTHLY_ID: "plan_agency_monthly_safe",
  RAZORPAY_PLAN_AGENCY_ANNUAL_ID: "plan_agency_annual_safe",
};

function run(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [script], { env, encoding: "utf8" });
}

describe("billing configuration preflight", () => {
  it("accepts a complete production mapping without printing secrets", () => {
    const result = run(completeEnv);
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(0);
    expect(output).toContain("https://app.linkar.in/api/razorpay/webhook");
    expect(output).toContain("plan_creator_monthly_safe");
    expect(output).not.toContain(completeEnv.RAZORPAY_KEY_SECRET);
    expect(output).not.toContain(completeEnv.RAZORPAY_WEBHOOK_SECRET);
  });

  it.each(required)("names a missing %s without exposing other values", (variable) => {
    const env = { ...completeEnv };
    delete env[variable];
    const result = run(env);
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain(variable);
    expect(output).not.toContain(completeEnv.RAZORPAY_KEY_SECRET);
    expect(output).not.toContain(completeEnv.RAZORPAY_WEBHOOK_SECRET);
  });

  it("rejects a non-plan ID and a non-production app origin", () => {
    const result = run({ ...completeEnv, APP_URL: "http://localhost:3000", RAZORPAY_PLAN_CREATOR_MONTHLY_ID: "price_wrong" });
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain("APP_URL");
    expect(output).toContain("RAZORPAY_PLAN_CREATOR_MONTHLY_ID");
  });

  it("rejects a test-mode Razorpay key for production activation", () => {
    const result = run({ ...completeEnv, RAZORPAY_KEY_ID: "rzp_test_public_value" });
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("RAZORPAY_KEY_ID must be a live-mode key");
  });

  it("rejects an arbitrary insecure worker endpoint", () => {
    const result = run({ ...completeEnv, WORKER_HEALTH_URL: "http://worker.internal/health" });
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("WORKER_HEALTH_URL");
  });

  it("rejects reused plan IDs across tiers or billing intervals", () => {
    const result = run({
      ...completeEnv,
      RAZORPAY_PLAN_GROWTH_MONTHLY_ID: completeEnv.RAZORPAY_PLAN_CREATOR_MONTHLY_ID,
    });
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("Razorpay Plan IDs must be unique");
  });

  it("requires the worker heartbeat endpoint without printing its value", () => {
    const env = { ...completeEnv };
    delete env.WORKER_HEALTH_URL;
    const result = run(env);
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).toBe(1);
    expect(output).toContain("WORKER_HEALTH_URL");
    expect(output).not.toContain(completeEnv.RAZORPAY_KEY_SECRET);
  });
});
