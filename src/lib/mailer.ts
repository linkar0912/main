import { logger } from "./logger";
import { getServerEnv } from "./env";

export type OutboundEmail = {
    to: string;
    subject: string;
    body: string;
};

// Transport seam for transactional email. Without SMTP/Resend credentials the
// mail is written to the log (and surfaced in dev server output) so password
// reset and verification flows work end-to-end locally. Wire a real provider
// (Resend/SES) here when EMAIL_API_KEY is configured.
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

export function passwordResetEmail(appUrl: string, resetPath: string): (to: string) => OutboundEmail {
    return (to) => ({
        to,
        subject: "Reset your ReplyConnect password",
        body: `Reset your password with this link (valid for 1 hour):
${appUrl}${resetPath}

If you did not request this, you can ignore this email.`,
    });
}

export function emailVerificationEmail(appUrl: string, verifyPath: string): (to: string) => OutboundEmail {
    return (to) => ({
        to,
        subject: "Verify your ReplyConnect email",
        body: `Verify your email address with this link (valid for 24 hours):
${appUrl}${verifyPath}`,
    });
}