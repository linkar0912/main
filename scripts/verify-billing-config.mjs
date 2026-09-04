const PLAN_VARIABLES = [
  "RAZORPAY_PLAN_CREATOR_MONTHLY_ID",
  "RAZORPAY_PLAN_CREATOR_ANNUAL_ID",
  "RAZORPAY_PLAN_GROWTH_MONTHLY_ID",
  "RAZORPAY_PLAN_GROWTH_ANNUAL_ID",
  "RAZORPAY_PLAN_AGENCY_MONTHLY_ID",
  "RAZORPAY_PLAN_AGENCY_ANNUAL_ID",
];

const SECRET_VARIABLES = ["RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
const REQUIRED_VARIABLES = ["RAZORPAY_KEY_ID", ...SECRET_VARIABLES, ...PLAN_VARIABLES];
const EXPECTED_WEBHOOK_URL = "https://app.linkar.in/api/razorpay/webhook";

export function validateBillingConfig(env) {
  const errors = [];
  for (const name of REQUIRED_VARIABLES) {
    if (!env[name]?.trim()) errors.push(`${name} is required`);
  }
  for (const name of PLAN_VARIABLES) {
    const value = env[name]?.trim();
    if (value && !/^plan_[A-Za-z0-9_]+$/.test(value)) errors.push(`${name} must begin with plan_`);
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
  console.log("Billing configuration is complete.");
  console.log(`Webhook: ${result.webhookUrl}`);
  for (const name of result.planVariables) console.log(`${name}=${process.env[name]}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
