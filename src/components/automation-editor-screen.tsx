"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { AutomationBuilder } from "./automation-builder";
import { InlineContentSkeleton } from "./skeleton";
import type { AutomationRecord } from "@/src/lib/repository";

/** Why the editor could not open: the automation is gone, or loading failed and may work on a retry. */
type LoadError = "missing" | "failed";

export function AutomationEditorScreen({ automationId }: { automationId: string }) {
  const [automation, setAutomation] = useState<AutomationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(`/api/automations/${automationId}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: AutomationRecord; error?: string };
        if (response.status === 404) {
          if (active) setError("missing");
          return;
        }
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load this automation");
        if (active) setAutomation(payload.data);
      })
      .catch(() => {
        if (active) setError("failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [automationId, attempt]);

  function retry() {
    setError(null);
    setLoading(true);
    setAttempt((current) => current + 1);
  }

  return (
    <>
      <div className="page-wrap builder-wrap">
        <Link className="back-link" href="/automations"><ArrowLeft size={16} /> Back to automations</Link>
        {loading && (
          <InlineContentSkeleton label="Loading automation editor" rows={5} />
        )}
        {!loading && error === "missing" && (
          <section className="builder-card builder-load-error" role="alert">
            <h2>This automation no longer exists</h2>
            <p>It may have been deleted by someone in your workspace.</p>
            <Link className="button button-secondary" href="/automations">Back to automations</Link>
          </section>
        )}
        {!loading && error === "failed" && (
          <section className="builder-card builder-load-error" role="alert">
            <h2>This automation couldn’t be opened</h2>
            <p>Linkar couldn’t load it just now. Nothing has changed, so try again in a moment.</p>
            <button type="button" className="button button-primary" onClick={retry}>
              <RefreshCw size={16} aria-hidden /> Try again
            </button>
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
