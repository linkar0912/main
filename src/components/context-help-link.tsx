import Link from "next/link";
import { CircleHelp } from "lucide-react";

export function ContextHelpLink({ topic, label = "Need help?" }: { topic: string; label?: string }) {
  const params = new URLSearchParams({ topic });
  return (
    <Link className="context-help-link button button-ghost button-small" href={`/help?${params.toString()}`}>
      <CircleHelp size={15} strokeWidth={1.9} /> {label}
    </Link>
  );
}
