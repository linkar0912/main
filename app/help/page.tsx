import { getServerEnv } from "@/src/lib/env";
import { HelpScreen } from "@/src/components/help-screen";

// force-dynamic is required, not vestigial: supportEmail is read from
// process.env at render time, and without this the page becomes eligible for
// full static generation - meaning supportEmail would be baked in during the
// Docker image build (where the real production SUPPORT_EMAIL isn't set)
// instead of reflecting whatever value is actually configured in Coolify.
// Every other page that reads supportEmail (privacy, terms, support,
// data-deletion) is force-dynamic for the same reason.
export const dynamic = "force-dynamic";

export default function HelpPage() {
    const { supportEmail } = getServerEnv();
    return <HelpScreen supportEmail={supportEmail} />;
}
