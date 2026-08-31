import { HelpScreen } from "@/src/components/help-screen";

export const metadata = { title: "Help · Linkar" };

// A plain, statically-rendered client page (like /automations) rather than the
// force-dynamic server page this used to be. force-dynamic existed only so
// SUPPORT_EMAIL was read at request time instead of being baked into the Docker
// image build - but it also meant every navigation to /help waited on a fresh
// server round trip before anything painted. supportEmail now rides along on
// /api/workspace/bootstrap, which is already request-time and already fetched
// once by the app shell, so the runtime value is still honoured (Coolify's, not
// the build's) and the page renders immediately.
export default function HelpPage() {
    return <HelpScreen />;
}
