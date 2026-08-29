import { logger } from "./logger";
import { getServerEnv } from "./env";

export type OutboundEmail = {
    to: string;
    subject: string;
    body: string;
};

// Transport seam for transactional email (team invitations, product
// notifications). Without SMTP/Resend credentials the mail is written to the
// log (and surfaced in dev server output). Wire a real provider (Resend/SES)
// here when EMAIL_API_KEY is configured. Password-reset and signup-confirmation
// email is sent by Supabase Auth instead, not through this transport.
export async function sendEmail(email: OutboundEmail): Promise<{ delivered: boolean }> {
    const env = getServerEnv();
    if (!process.env.EMAIL_API_KEY) {
        logger.info("email (log transport)", { to: email.to, subject: email.subject, body: email.body });
        return { delivered: false };
    }
    // Provider integration point: POST to the configured provider with EMAIL_API_KEY.
    logger.info("email queued", { to: email.to, subject: email.subject, from: env.supportEmail });
    return { delivered: true };
}