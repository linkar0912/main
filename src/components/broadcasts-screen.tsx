"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { AppShell } from "./app-shell";
import { AutomationSectionNav } from "./automation-section-nav";

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

/** One-off DM blasts to a contact segment — its own tab, not a footnote on My Automations. */
export function BroadcastsScreen() {
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
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
      setLoading(false);
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

  return (
    <AppShell>
      <div className="page-wrap narrow-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Workspace / automation</p>
            <h1>Broadcasts</h1>
            <p className="muted page-lede">
              One-off DMs to a contact segment — paced ~1/second, STOP contacts skipped automatically.
            </p>
          </div>
        </header>

        <div className="section-layout">
          <AutomationSectionNav active="broadcasts" />
          <div className="section-content">
            <form className="panel full-list-panel" onSubmit={send}>
              <div className="list-intro">
                <div className="list-count"><Megaphone size={17} /><span>New broadcast</span></div>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
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
              <label className="field field-spaced">
                <span>Message</span>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder="Write the DM blast" />
              </label>
              <div className="builder-footer">
                <div />
                <button className="button button-primary" type="submit" disabled={sending}>
                  {sending ? "Fanning out…" : "Send broadcast"}
                </button>
              </div>
            </form>

            <section className="panel full-list-panel">
              <div className="list-intro">
                <div className="list-count"><Megaphone size={17} /><span>{loading ? "Loading" : `${broadcasts.length} ${broadcasts.length === 1 ? "broadcast" : "broadcasts"}`}</span></div>
              </div>
              {!loading && broadcasts.length === 0 ? (
                <p className="muted">No broadcasts sent yet — compose one above.</p>
              ) : (
                <div className="automation-list">
                  {broadcasts.map((broadcast) => (
                    <article className="automation-row" key={broadcast.id}>
                      <div className="automation-icon"><Megaphone size={19} strokeWidth={1.7} /></div>
                      <div className="automation-copy">
                        <div className="automation-title">
                          <strong>{broadcast.name}</strong>
                          <em className="sequence-status" data-status={broadcast.status}>{broadcast.status}</em>
                        </div>
                        <p>
                          {broadcast.sent}/{broadcast.total} sent
                          {broadcast.failed > 0 ? ` · ${broadcast.failed} failed` : ""}
                          {broadcast.skipped > 0 ? ` · ${broadcast.skipped} skipped` : ""}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
