import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { LoginScreen } from "@/src/components/auth/login-screen";
import { sanitizeInvite } from "@/src/lib/auth/auth-redirect";
import { getRequestSession, safeNextPath } from "@/src/lib/auth/session";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { describePlanIntent, parsePlanIntent } from "@/src/lib/billing/plan-intent";
import { ADMIN_HOST, resolveRequestHostname } from "@/src/lib/site-routing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Sign in · ${PRODUCT_NAME}`,
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
    reset?: string;
    verify?: string;
    invite?: string;
    email?: string;
    notice?: string;
    loggedOut?: string;
    plan?: string;
    interval?: string;
  }>;
};

const ERRORS: Record<string, string> = {
  invalid: "That email or password is incorrect.",
  exists: "An account with that email already exists. Sign in instead.",
  locked: "Too many attempts. Wait fifteen minutes before trying again.",
  oauth: "Signing in with Google or Facebook did not finish. Try again, or use your email and password.",
  cancelled: "Sign-in was cancelled. Choose a way to continue when you are ready.",
  unconfirmed: "Confirm your email address before signing in. Open the link we sent, or send a new one below.",
  "resend-email": "Enter a valid email address to resend the confirmation link.",
  "resend-locked": "Too many confirmation emails requested. Try again in an hour.",
};

function isOwnerConsolePath(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Whether this request came in on the owner-console host. */
async function onOwnerConsoleHost(): Promise<boolean> {
  try {
    return resolveRequestHostname(await headers(), "").toLowerCase().replace(/:\d+$/, "") === ADMIN_HOST;
  } catch (error) {
    // Outside a request (a render in a unit test) there is no host to read,
    // so behave as the app host. Next's own control-flow errors still pass.
    unstable_rethrow(error);
    return false;
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  // admin.linkar.in/login only signs in to the owner console. Any other next
  // would make the login route answer with a 303 to app.linkar.in, which the
  // console's CSP form-action used to block, and could provision a workspace
  // for an owner who has none.
  const adminHost = await onOwnerConsoleHost();
  const requestedNext = safeNextPath(params.next);
  const nextPath = adminHost && !isOwnerConsolePath(requestedNext) ? "/admin" : requestedNext;
  const invite = sanitizeInvite(params.invite);

  // Already signed in (with a workspace): there is nothing to do here. A
  // session check that fails (auth provider unreachable) just shows the form.
  const session = await getRequestSession().catch(() => null);
  if (session) redirect(nextPath);

  const verifyInvalid = params.verify === "invalid";
  const error = verifyInvalid
    ? "That confirmation link is invalid or has expired. Send yourself a new one below."
    : ERRORS[params.error ?? ""] ?? "";
  // A paid plan picked on /pricing (remembered by the proxy): checkout opens
  // right after signing in. Invitations never carry one.
  const planIntent = invite ? null : parsePlanIntent(params.plan, params.interval);
  const notice = params.reset === "1"
    ? "Your password has been reset. Sign in with your new password."
    : params.notice === "resent"
      ? "If that address still needs confirming, a new link is on its way."
      : params.loggedOut === "all"
        ? "You have been signed out on every device."
        : planIntent
          ? `You picked the ${describePlanIntent(planIntent)}. Sign in and we will take you to checkout.`
          : "";
  const unconfirmedEmail = params.error === "unconfirmed" && typeof params.email === "string" && params.email.length <= 320
    ? params.email
    : undefined;
  const resend = unconfirmedEmail ?? (verifyInvalid || params.error === "unconfirmed" || params.error?.startsWith("resend-") ? true : undefined);

  return <LoginScreen nextPath={nextPath} invite={invite} error={error} notice={notice} resend={resend} adminHost={adminHost} />;
}
