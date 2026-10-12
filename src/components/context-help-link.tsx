import Link from "next/link";
import { CircleHelp } from "lucide-react";

/**
 * The page's "Need help?": one quiet text link with the help icon. Pass it as
 * PageHeader's `help` so it sits in the same place on every page.
 */
export function ContextHelpLink({ topic, label = "Need help?" }: { topic: string; label?: string }) {
  const params = new URLSearchParams({ topic });
  return (
    <Link className="context-help-link" href={`/help?${params.toString()}`}>
      <CircleHelp size={15} strokeWidth={1.9} aria-hidden /> {label}
    </Link>
  );
}
