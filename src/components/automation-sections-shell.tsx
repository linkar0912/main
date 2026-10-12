"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { AutomationSectionNav } from "./automation-section-nav";
import { ContextHelpLink } from "./context-help-link";
import { CreateAutomationButton } from "./create-automation-button";
import { PageHeader } from "./page-header";
import { AutomationSectionContentSkeleton } from "./skeleton";

type Section = "my" | "sequences" | "broadcasts";

const SECTIONS: Record<Section, { title: string; description: string; helpTopic: string }> = {
  my: {
    title: "Automations",
    description: "Rules that turn comments and DMs into timely replies.",
    helpTopic: "automations",
  },
  sequences: {
    title: "Sequences",
    description: "Timed DM follow-ups that new email leads join automatically.",
    helpTopic: "sequences",
  },
  broadcasts: {
    title: "Broadcasts",
    description: "One-off DMs to a contact segment, sent at a safe pace.",
    helpTopic: "sequences",
  },
};

function sectionFor(pathname: string): Section {
  if (pathname.includes("/automations/sequences")) return "sequences";
  if (pathname.includes("/automations/broadcasts")) return "broadcasts";
  return "my";
}

/**
 * Persistent frame for Automations / Sequences / Broadcasts. It lives in the
 * (sections) route layout, so switching sections keeps the header mounted -
 * only the content below swaps. The Automations list draws its own view tabs
 * (they carry its counts) with Sequences and Broadcasts linked at the end;
 * those two pages get a back link and a tab row of their own here.
 */
export function AutomationSectionsShell({ children, section: sectionOverride, basePath = "/automations" }: {
  children: ReactNode;
  /** Pins the section when the route path can't say it (app/dev-preview). */
  section?: Section;
  /** Where the sections live; the dev preview mounts them elsewhere. */
  basePath?: string;
}) {
  const routeSection = sectionFor(usePathname());
  const section = sectionOverride ?? routeSection;
  const { title, description, helpTopic } = SECTIONS[section];
  return (
    <div className={`page-wrap ws-page automation-sections is-${section}`}>
      <PageHeader
        back={section === "my" ? undefined : <Link className="back-link" href={basePath}><ArrowLeft size={15} /> Automations</Link>}
        title={title}
        description={description}
        // "New automation" lives in the top bar on every page; repeating it here
        // put two identical primary buttons on one screen.
        help={<ContextHelpLink topic={helpTopic} />}
        tabs={section === "my" ? undefined : <AutomationSectionNav active={section} basePath={basePath} />}
      />
      <div className="automation-section-body" key={section}>{children}</div>
    </div>
  );
}

/** Route loading state for the sections: the placeholder matches the section
 * being opened, not always the automation table. */
export function AutomationSectionLoading() {
  return <AutomationSectionContentSkeleton section={sectionFor(usePathname())} />;
}
