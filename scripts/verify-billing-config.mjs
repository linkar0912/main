const PLAN_VARIABLES = [
  "RAZORPAY_PLAN_CREATOR_MONTHLY_ID",
  "RAZORPAY_PLAN_CREATOR_ANNUAL_ID",
  "RAZORPAY_PLAN_GROWTH_MONTHLY_ID",
  "RAZORPAY_PLAN_GROWTH_ANNUAL_ID",
  "RAZORPAY_PLAN_AGENCY_MONTHLY_ID",
  "RAZORPAY_PLAN_AGENCY_ANNUAL_ID",
];

const SECRET_VARIABLES = ["RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
const REQUIRED_VARIABLES = ["RAZORPAY_KEY_ID", ...SECRET_VARIABLES, ...PLAN_VARIABLES, "WORKER_HEALTH_URL"];
const EXPECTED_WEBHOOK_URL = "https://app.linkar.in/api/razorpay/webhook";

function isValidWorkerHealthUrl(value) {
  try {
    const url = new URL(value ?? "");
    if (url.protocol === "https:") return true;
    // Coolify's compose network keeps the worker private. The web container
    // reaches it over the isolated Docker network, so this one exact HTTP
    // origin is safe and is the default rendered by docker-compose.coolify.yml.
    return url.protocol === "http:" && url.hostname === "worker" && url.port === "3001" && url.pathname === "/health";
  } catch {
    return false;
  }
}

export function validateBillingConfig(env) {
  const errors = [];
  for (const name of REQUIRED_VARIABLES) {
    if (!env[name]?.trim()) errors.push(`${name} is required`);
  }
  for (const name of PLAN_VARIABLES) {
    const value = env[name]?.trim();
    if (value && !/^plan_[A-Za-z0-9_]+$/.test(value)) errors.push(`${name} must begin with plan_`);
  }
  if (env.NODE_ENV === "production" && env.RAZORPAY_KEY_ID?.trim() && !env.RAZORPAY_KEY_ID.trim().startsWith("rzp_live_")) {
    errors.push("RAZORPAY_KEY_ID must be a live-mode key in production");
  }
  const configuredPlanIds = PLAN_VARIABLES.map((name) => env[name]?.trim()).filter(Boolean);
  if (new Set(configuredPlanIds).size !== configuredPlanIds.length) {
    errors.push("Razorpay Plan IDs must be unique across tiers and billing intervals");
  }

  let webhookUrl;
  try {
    const appUrl = new URL(env.APP_URL ?? "");
    webhookUrl = new URL("/api/razorpay/webhook", appUrl).toString();
    if (appUrl.protocol !== "https:" || webhookUrl !== EXPECTED_WEBHOOK_URL) {
      errors.push(`APP_URL must derive ${EXPECTED_WEBHOOK_URL}`);
    }
  } catch {
    errors.push("APP_URL must be a valid HTTPS URL");
  }
  if (!isValidWorkerHealthUrl(env.WORKER_HEALTH_URL)) {
    errors.push("WORKER_HEALTH_URL must be HTTPS or the private Coolify URL http://worker:3001/health");
  }

  return { ok: errors.length === 0, errors, webhookUrl, planVariables: PLAN_VARIABLES };
}

function main() {
  const result = validateBillingConfig(process.env);
  if (!result.ok) {
    console.error("Billing preflight failed:");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("Razorpay live-mode billing configuration is complete.");
  console.log(`Webhook: ${result.webhookUrl}`);
  for (const name of result.planVariables) console.log(`${name}=${process.env[name]}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
