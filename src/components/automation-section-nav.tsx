"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ListOrdered, Megaphone } from "lucide-react";
import { slidingThumbRef } from "@/src/components/ui/use-sliding-thumb";

type SectionKey = "my" | "sequences" | "broadcasts";

const SECONDARY = [
  { key: "sequences", path: "/sequences", label: "Sequences", icon: ListOrdered },
  { key: "broadcasts", path: "/broadcasts", label: "Broadcasts", icon: Megaphone },
] as const;

/**
 * Sequences and Broadcasts live beside Automations. On the Automations list
 * they are two quiet links at the end of the view tabs; on their own pages
 * they are the tab row under the header (the back link returns to the list).
 */
export function AutomationSectionNav({ active, basePath = "/automations" }: {
  active: SectionKey;
  /** Where the sections live; the dev preview mounts them elsewhere. */
  basePath?: string;
}) {
  const pathname = usePathname();
  // Optimistic selection: the underline moves on click, not after the next
  // page's data arrives. It only applies while we are still on the page we
  // clicked from, so any other navigation falls back to the real route.
  const [pending, setPending] = useState<{ key: SectionKey; from: string } | null>(null);
  const shown = pending && pending.from === pathname ? pending.key : active;

  if (active === "my") {
    return (
      <nav className="auto-section-links" aria-label="Automation sections">
        {SECONDARY.map(({ key, path, label, icon: Icon }) => (
          <Link key={key} href={`${basePath}${path}`}>
            <Icon size={16} strokeWidth={1.9} aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav ref={slidingThumbRef} className="page-tabs auto-view-tabs is-sections" aria-label="Automation sections">
      {SECONDARY.map(({ key, path, label, icon: Icon }) => (
        <Link
          key={key}
          className={`page-tab${shown === key ? " is-active" : ""}`}
          href={`${basePath}${path}`}
          aria-current={active === key ? "page" : undefined}
          onClick={() => { if (key !== active) setPending({ key, from: pathname }); }}
        >
          <Icon size={16} strokeWidth={1.9} aria-hidden />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
