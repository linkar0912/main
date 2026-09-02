"use client";

import { Plus, Workflow } from "lucide-react";
import { AppShell } from "./app-shell";
import { AutomationList, useAutomations } from "./automation-list";
import { CreateAutomationButton } from "./create-automation-button";
import { DeliveryDiagnostics } from "./delivery-diagnostics";
import { ContextHelpLink } from "./context-help-link";

export function AutomationsScreen() {
  const { automations, loading, error, setStatus, reload } = useAutomations();

  async function duplicateAutomation(id: string) {
    const response = await fetch(`/api/automations/${id}/duplicate`, { method: "POST" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Could not duplicate this automation.");
    }
    await reload();
  }

  async function deleteAutomation(id: string) {
    const response = await fetch(`/api/automations/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? "Could not delete this automation.");
    }
    await reload();
  }

  return (
    <AppShell>
      <div className="page-wrap narrow-wrap">
        <header className="page-header">
          <div><p className="eyebrow">Workspace / automation</p><h1>Automations</h1><p className="muted page-lede">Rules that turn Instagram and Facebook signals into helpful, timely replies.</p></div>
          <div className="header-actions">
            <ContextHelpLink topic="automations" />
            <CreateAutomationButton className="button button-primary"><Plus size={17} /> New automation</CreateAutomationButton>
          </div>
        </header>
        <div className="section-content">
            {!loading && automations.length > 0 && (
              <div className="list-intro">
                <div className="list-count"><Workflow size={17} /><span>{automations.length} {automations.length === 1 ? "automation" : "automations"}</span></div>
              </div>
            )}
            <section className="panel full-list-panel">
              {error ? <p className="form-error" role="alert">{error}</p> : <AutomationList automations={automations} loading={loading} onStatusChange={setStatus} onDuplicate={duplicateAutomation} onDelete={deleteAutomation} />}
            </section>
            {automations.length > 0 && <DeliveryDiagnostics />}
        </div>
      </div>
    </AppShell>
  );
}
