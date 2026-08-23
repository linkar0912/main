import { getServerEnv } from "@/src/lib/env";
import { HelpScreen } from "@/src/components/help-screen";

export const dynamic = "force-dynamic";

export default function HelpPage() {
    const { supportEmail } = getServerEnv();
    return <HelpScreen supportEmail={supportEmail} />;
}
