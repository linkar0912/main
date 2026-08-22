"use client";

import Link from "next/link";
import { ListOrdered, Workflow, Zap } from "lucide-react";

/** Left-hand sub-navigation shared by My Automations, Basic and Sequences. */
export function AutomationSectionNav({ active }: { active: "my" | "basic" | "sequences" }) {
  return (
    <nav className="section-nav" aria-label="Automation sections">
      <Link className={`section-nav-link ${active === "my" ? "is-active" : ""}`} href="/automations">
        <Workflow size={18} strokeWidth={1.8} />
        <span>My Automations</span>
      </Link>
      <Link className={`section-nav-link ${active === "basic" ? "is-active" : ""}`} href="/automations/templates">
        <Zap size={18} strokeWidth={1.8} />
        <span>Basic</span>
      </Link>
      <Link className={`section-nav-link ${active === "sequences" ? "is-active" : ""}`} href="/automations/sequences">
        <ListOrdered size={18} strokeWidth={1.8} />
        <span>Sequences</span>
      </Link>
    </nav>
  );
}
