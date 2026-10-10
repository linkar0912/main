"use client";

import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
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
  if (pathname.startsWith("/automations/sequences")) return "sequences";
  if (pathname.startsWith("/automations/broadcasts")) return "broadcasts";
  return "my";
}

/**
 * Persistent frame for My Automations / Sequences / Broadcasts. It lives in the
 * (sections) route layout, so switching sections keeps the header and the
 * section switch mounted - only the content below swaps. Each page used to
 * render its own header, and the shared loading state showed the Automations
 * header first, so every switch flashed the wrong title and bounced the pill.
 */
export function AutomationSectionsShell({ children, section: sectionOverride }: {
  children: ReactNode;
  /** Pins the section when the route path can't say it (app/dev-preview). */
  section?: Section;
}) {
  const routeSection = sectionFor(usePathname());
  const section = sectionOverride ?? routeSection;
  const { title, description, helpTopic } = SECTIONS[section];
  return (
    <div className="page-wrap ws-page automation-sections">
      <PageHeader
        title={title}
        description={description}
        actions={(
          <>
            <ContextHelpLink topic={helpTopic} />
            {section === "my" ? (
              <CreateAutomationButton className="button button-primary"><Plus size={16} /> New automation</CreateAutomationButton>
            ) : null}
          </>
        )}
        tabs={<AutomationSectionNav active={section} />}
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
