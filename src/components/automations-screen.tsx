"use client";

import { useEffect, useState } from "react";
import { AtSign, Plus, Workflow } from "lucide-react";
import { AppShell } from "./app-shell";
import { AutomationList, useAutomations } from "./automation-list";
import { AutomationSectionNav } from "./automation-section-nav";
import { CreateAutomationButton } from "./create-automation-button";
import { DeliveryDiagnostics } from "./delivery-diagnostics";
import { formatDate } from "@/src/lib/format-date";

type CapturedContact = {
  id: string;
  email: string;
  instagramAccountId: string;
  capturedAt: string;
};

/** Live view of emails captured by DM email-capture flows, served by /api/contacts. */
function CapturedEmailsPanel() {
  const [contacts, setContacts] = useState<CapturedContact[]>([]);
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/contacts?limit=25")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data?: { count: number; contacts: CapturedContact[] } } | null) => {
        if (cancelled || !payload?.data) return;
        setContacts(payload.data.contacts);
        setCount(payload.data.count);
        setLoaded(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;

  return (
    <section className="panel full-list-panel" data-testid="captured-emails">
      <div className="list-intro">
        <div className="list-count"><AtSign size={17} /><span>{count} {count === 1 ? "email" : "emails"} captured</span></div>
        {contacts.length > 0 && (
          <a className="button button-secondary button-small" href="/api/contacts/export" download>
            Export CSV
          </a>
        )}
      </div>
      {contacts.length === 0 ? (
        <p className="muted">No emails yet. Turn on an email collector - the Email Capture template is a good start.</p>
      ) : (
        <ul className="captured-emails">
          {contacts.map((contact) => (
            <li key={contact.id}>
              <span className="captured-email-address">{contact.email}</span>
              <time dateTime={contact.capturedAt}>{formatDate(contact.capturedAt)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

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
          <div><p className="eyebrow">Workspace / automation</p><h1>Automations</h1><p className="muted page-lede">Rules that turn Instagram signals into helpful, timely replies.</p></div>
          <div className="header-actions">
            <CreateAutomationButton className="button button-primary"><Plus size={17} /> New automation</CreateAutomationButton>
          </div>
        </header>
        <div className="section-layout">
          <AutomationSectionNav active="my" />
          <div className="section-content">
            {!loading && automations.length > 0 && (
              <div className="list-intro">
                <div className="list-count"><Workflow size={17} /><span>{automations.length} {automations.length === 1 ? "automation" : "automations"}</span></div>
              </div>
            )}
            <section className="panel full-list-panel">
              {error ? <p className="form-error" role="alert">{error}</p> : <AutomationList automations={automations} loading={loading} onStatusChange={setStatus} onDuplicate={duplicateAutomation} onDelete={deleteAutomation} />}
            </section>
            {automations.length > 0 && (
              <>
                <CapturedEmailsPanel />
                <DeliveryDiagnostics />
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
