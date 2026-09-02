import { LoginScreen } from "@/src/components/auth/login-screen";
import { safeNextPath } from "@/src/lib/auth/session";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string; reset?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const error = params.error === "invalid"
    ? "That email or password is incorrect."
    : params.error === "exists"
      ? "An account with that email already exists. Sign in instead."
      : params.error === "locked"
        ? "Too many failed attempts. Wait fifteen minutes before trying again."
        : params.error === "oauth"
          ? "Something went wrong signing in. Please try again."
          : "";
  const notice = params.reset === "1" ? "Your password has been reset. Sign in with your new password." : "";

  return <LoginScreen nextPath={nextPath} error={error} notice={notice} />;
}
