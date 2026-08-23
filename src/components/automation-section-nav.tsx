"use client";

import Link from "next/link";
import { ListOrdered, Megaphone, Workflow } from "lucide-react";

/** Left-hand sub-navigation shared by My Automations, Sequences and Broadcasts. */
export function AutomationSectionNav({ active }: { active: "my" | "sequences" | "broadcasts" }) {
  return (
    <nav className="section-nav" aria-label="Automation sections">
      <Link className={`section-nav-link ${active === "my" ? "is-active" : ""}`} href="/automations">
        <Workflow size={18} strokeWidth={1.8} />
        <span>My Automations</span>
      </Link>
      <Link className={`section-nav-link ${active === "sequences" ? "is-active" : ""}`} href="/automations/sequences">
        <ListOrdered size={18} strokeWidth={1.8} />
        <span>Sequences</span>
      </Link>
      <Link className={`section-nav-link ${active === "broadcasts" ? "is-active" : ""}`} href="/automations/broadcasts">
        <Megaphone size={18} strokeWidth={1.8} />
        <span>Broadcasts</span>
      </Link>
    </nav>
  );
}
