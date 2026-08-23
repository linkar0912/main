"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AtSign, Megaphone, LayoutTemplate, Plus, Workflow } from "lucide-react";
import { AppShell } from "./app-shell";
import { AutomationList, useAutomations } from "./automation-list";
import { AutomationSectionNav } from "./automation-section-nav";
import { DeliveryDiagnostics } from "./delivery-diagnostics";

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
        <p className="muted">No emails yet. Turn on an email collector — the Email Capture template is a good start.</p>
      ) : (
        <ul className="captured-emails">
          {contacts.map((contact) => (
            <li key={contact.id}>
              <span className="captured-email-address">{contact.email}</span>
              <time dateTime={contact.capturedAt}>{new Date(contact.capturedAt).toLocaleDateString()}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type BroadcastRow = {
  id: string;
  name: string;
  status: string;
  segment: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
};

/** Compose + fan out a one-off DM blast to a contact segment. */
function BroadcastsPanel() {
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [segment, setSegment] = useState<"all_contacts" | "captured_email">("captured_email");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      const payload = await fetch("/api/broadcasts").then((r) => r.json());
      setBroadcasts(payload.data ?? []);
    } catch {
      // panel is optional surface; silence fetch hiccups
    } finally {
      setLoaded(true);
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim() || !text.trim()) return setError("Give the blast a name and a message.");
    setSending(true);
    try {
      const response = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), text: text.trim(), segment }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not start this broadcast.");
      }
      setName("");
      setText("");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start this broadcast.");
    } finally {
      setSending(false);
    }
  }

  if (!loaded) return null;

  return (
    <section className="panel full-list-panel" data-testid="broadcasts">
      <div className="list-intro">
        <div className="list-count"><Megaphone size={17} /><span>Broadcasts</span></div>
        <span className="muted">One-off DMs to a segment — paced ~1/second, STOP contacts skipped.</span>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <form onSubmit={send} className="broadcast-form">
        <div className="field-grid">
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Weekend offer" />
          </label>
          <label className="field">
            <span>Segment</span>
            <select value={segment} onChange={(e) => setSegment(e.target.value as "all_contacts" | "captured_email")}>
              <option value="captured_email">Leads with a captured email</option>
              <option value="all_contacts">All known contacts</option>
            </select>
          </label>
        </div>
        <label className="field">
          <span>Message</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} placeholder="Write the DM blast" />
        </label>
        <button className="button button-primary" type="submit" disabled={sending}>
          {sending ? "Fanning out…" : "Send broadcast"}
        </button>
      </form>
      {broadcasts.length > 0 && (
        <ul className="broadcast-list">
          {broadcasts.map((broadcast) => (
            <li key={broadcast.id}>
              <div className="automation-copy">
                <div className="automation-title"><strong>{broadcast.name}</strong><em className="sequence-status" data-status={broadcast.status}>{broadcast.status}</em></div>
                <p>{broadcast.sent}/{broadcast.total} sent{broadcast.failed > 0 ? ` · ${broadcast.failed} failed` : ""}{broadcast.skipped > 0 ? ` · ${broadcast.skipped} skipped` : ""}</p>
              </div>
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
            <Link className="button button-secondary" href="/automations/templates"><LayoutTemplate size={17} /> Templates</Link>
            <Link className="button button-primary" href="/automations/new"><Plus size={17} /> New automation</Link>
          </div>
        </header>
        <div className="section-layout">
          <AutomationSectionNav active="my" />
          <div className="section-content">
            <div className="list-intro"><div className="list-count"><Workflow size={17} /><span>{loading ? "Loading" : `${automations.length} ${automations.length === 1 ? "automation" : "automations"}`}</span></div><span className="muted">Everything is explicit and editable.</span></div>
            <section className="panel full-list-panel">
              {error ? <p className="form-error" role="alert">{error}</p> : <AutomationList automations={automations} loading={loading} onStatusChange={setStatus} onDuplicate={duplicateAutomation} onDelete={deleteAutomation} />}
            </section>
            <CapturedEmailsPanel />
            <DeliveryDiagnostics />
            <BroadcastsPanel />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
