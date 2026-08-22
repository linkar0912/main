import Link from "next/link";

export const metadata = { title: "Set a new password · Linkar" };

export default async function ResetPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string; error?: string }>;
}) {
    const params = await searchParams;
    const token = params.token ?? "";

    if (params.error === "invalid") {
        return (
            <main className="auth-page">
                <h1>Reset link invalid</h1>
                <p>This reset link is invalid, already used, or expired.</p>
                <p>
                    <Link href="/forgot-password">Request a new link</Link>
                </p>
            </main>
        );
    }
    if (!token) {
        return (
            <main className="auth-page">
                <h1>Set a new password</h1>
                <p>Open the reset link from your email to choose a new password.</p>
                <p>
                    <Link href="/forgot-password">Request a reset link</Link>
                </p>
            </main>
        );
    }

    return (
        <main className="auth-page">
            <h1>Set a new password</h1>
            {params.error === "password" ? (
                <p role="alert">Passwords must be at least 12 characters.</p>
            ) : null}
            <form method="post" action="/api/auth/reset-password">
                <input type="hidden" name="token" value={token} />
                <label htmlFor="password">New password</label>
                <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={200}
                    autoComplete="new-password"
                />
                <button type="submit">Save new password</button>
            </form>
        </main>
    );
}