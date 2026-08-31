import { ProfileScreen } from "@/src/components/profile-screen";

export const metadata = { title: "My Profile · Linkar" };

// Deliberately a plain, statically-rendered client page (like /automations and
// /settings) rather than a force-dynamic server page. The previous shape awaited
// getValidatedSession(), supabase.auth.getUser(), and getMemberRole() before
// returning any HTML, so every navigation to /profile sat on the loading
// skeleton for a full server round trip plus two network calls. ProfileScreen
// now reads email/role/plan from the shell bootstrap the sidebar already
// fetched and pulls memberSince/emailVerified from /api/account, so the page
// paints immediately and fills in. Proxy still gates the route (see proxy.ts).
export default function ProfilePage() {
    return <ProfileScreen />;
}
