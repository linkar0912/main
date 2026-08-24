"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "./app-shell";
import { AutomationBuilder } from "./automation-builder";
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
    <AppShell>
      <div className="page-wrap builder-wrap">
        <Link className="back-link" href="/automations"><ArrowLeft size={16} /> Back to automations</Link>
        {loading && (
          <div className="empty-state">
            <div className="loading-line" />
            <div className="loading-line short" />
            <div className="loading-line" />
          </div>
        )}
        {!loading && error && <p className="form-error" role="alert">{error}</p>}
        {!loading && !error && automation && (
          <AutomationBuilder
            automationId={automation.id}
            initialName={automation.name}
            initialDefinition={automation.definition}
            initialInstagramAccountId={automation.instagramAccountId}
          />
        )}
      </div>
    </AppShell>
  );
}
