import { logger } from "./logger";
import { getServerEnv } from "./env";

export type OutboundEmail = {
  to: string;
  subject: string;
  body: string;
  idempotencyKey?: string;
};

export type EmailDeliveryResult =
  | { delivered: true; id: string }
  | { delivered: false; reason: "not_configured" | "provider_error" | "network_error"; status?: number };

type Fetch = typeof fetch;

export function createMailer(configuration: {
  apiKey?: string;
  from?: string;
  fetch?: Fetch;
  timeoutMs?: number;
}) {
  return {
    async send(email: OutboundEmail): Promise<EmailDeliveryResult> {
      if (!configuration.apiKey || !configuration.from) {
        logger.warn("email delivery unavailable", { to: email.to, subject: email.subject, reason: "not_configured" });
        return { delivered: false, reason: "not_configured" };
      }

      try {
        const response = await (configuration.fetch ?? fetch)("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${configuration.apiKey}`,
            "Content-Type": "application/json",
            "User-Agent": "Linkar/1.0 production-alerts",
            ...(email.idempotencyKey ? { "Idempotency-Key": email.idempotencyKey.slice(0, 256) } : {}),
          },
          body: JSON.stringify({ from: configuration.from, to: [email.to], subject: email.subject, text: email.body }),
          signal: AbortSignal.timeout(configuration.timeoutMs ?? 10_000),
        });
        if (!response.ok) {
          logger.error("email provider rejected request", { to: email.to, subject: email.subject, status: response.status });
          return { delivered: false, reason: "provider_error", status: response.status };
        }
        const result = await response.json().catch(() => null) as { id?: unknown } | null;
        if (!result || typeof result.id !== "string") {
          logger.error("email provider returned invalid response", { to: email.to, subject: email.subject });
          return { delivered: false, reason: "provider_error", status: response.status };
        }
        logger.info("email delivered", { to: email.to, subject: email.subject, providerId: result.id });
        return { delivered: true, id: result.id };
      } catch (error) {
        logger.error("email delivery failed", {
          to: email.to,
          subject: email.subject,
          error: error instanceof Error ? error.name : "UnknownError",
        });
        return { delivered: false, reason: "network_error" };
      }
    },
  };
}

export async function sendEmail(email: OutboundEmail): Promise<EmailDeliveryResult> {
  const env = getServerEnv();
  return createMailer({ apiKey: env.emailApiKey, from: env.emailFrom }).send(email);
}
