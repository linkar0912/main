"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { AutomationBuilder } from "./automation-builder";
import { InlineContentSkeleton } from "./skeleton";
import type { AutomationRecord } from "@/src/lib/repository";

export function AutomationEditorScreen({ automationId }: { automationId: string }) {
  const [automation, setAutomation] = useState<AutomationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/automations/${automationId}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: AutomationRecord; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load this automation");
        if (active) setAutomation(payload.data);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load this automation");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [automationId]);

  return (
    <>
      <div className="page-wrap builder-wrap">
        <Link className="back-link" href="/automations"><ArrowLeft size={16} /> Back to automations</Link>
        {loading && (
          <InlineContentSkeleton label="Loading automation editor" rows={5} />
        )}
        {!loading && error && (
          <section className="builder-card builder-load-error" role="alert">
            <h2>This automation couldn’t be opened</h2>
            <p>{error.replace(/\.$/, "")}. It may have been deleted, or the page needs a refresh.</p>
            <Link className="button button-secondary" href="/automations">Back to automations</Link>
          </section>
        )}
        {!loading && !error && automation && (
          <AutomationBuilder
            automationId={automation.id}
            initialName={automation.name}
            initialDefinition={automation.definition}
            initialInstagramAccountId={automation.instagramAccountId}
            initialFacebookPageId={automation.facebookPageId}
            initialPriority={automation.priority}
          />
        )}
      </div>
    </>
  );
}
