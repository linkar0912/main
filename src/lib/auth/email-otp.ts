import type { EmailOtpType } from "@supabase/supabase-js";

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/** Narrows an untrusted `type` query/form value to a Supabase email OTP type. */
export function parseEmailOtpType(value: string | null | undefined): EmailOtpType | null {
  return EMAIL_OTP_TYPES.includes(value as EmailOtpType) ? (value as EmailOtpType) : null;
}
