"use client";

import Link from "next/link";
import { Workflow, Zap } from "lucide-react";

/** Left-hand sub-navigation shared by the My Automations list and the Basic gallery. */
export function AutomationSectionNav({ active }: { active: "my" | "basic" }) {
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
    </nav>
  );
}
