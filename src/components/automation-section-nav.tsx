"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ListOrdered, Megaphone, Workflow } from "lucide-react";

type SectionKey = "my" | "sequences" | "broadcasts";

const SECTIONS = [
  { key: "my", href: "/automations", label: "My automations", icon: Workflow },
  { key: "sequences", href: "/automations/sequences", label: "Sequences", icon: ListOrdered },
  { key: "broadcasts", href: "/automations/broadcasts", label: "Broadcasts", icon: Megaphone },
] as const;

/** Section switch shared by My Automations, Sequences and Broadcasts, rendered under the page header. */
export function AutomationSectionNav({ active }: { active: SectionKey }) {
  const pathname = usePathname();
  // Optimistic selection: the pill moves on click, not after the next page's
  // data arrives. It only applies while we are still on the page we clicked
  // from, so any other navigation falls back to the real route.
  const [pending, setPending] = useState<{ key: SectionKey; from: string } | null>(null);
  const shown = pending && pending.from === pathname ? pending.key : active;

  return (
    <nav className="segmented page-switch" aria-label="Automation sections">
      {SECTIONS.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={key}
          className={`segmented-option ${shown === key ? "is-active" : ""}`}
          href={href}
          aria-current={active === key ? "page" : undefined}
          onClick={() => { if (key !== active) setPending({ key, from: pathname }); }}
        >
          <Icon size={15} strokeWidth={1.9} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
