import Link from "next/link";

export const metadata = { title: "Forgot password · Linkar" };

export default async function ForgotPasswordPage({
    searchParams,
}: {
    searchParams: Promise<{ sent?: string }>;
}) {
    const params = await searchParams;
    return (
        <main className="auth-page">
            <h1>Reset your password</h1>
            {params.sent ? (
                <p role="status">
                    If an account exists for that email, a reset link is on its way. The link expires in one hour.
                </p>
            ) : (
                <form method="post" action="/api/auth/forgot-password">
                    <label htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" required autoComplete="email" />
                    <button type="submit">Send reset link</button>
                </form>
            )}
            <p>
                Remembered it? <Link href="/login">Back to login</Link>
            </p>
        </main>
    );
}