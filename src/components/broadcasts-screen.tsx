"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { InlineContentSkeleton } from "./skeleton";

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

type Segment = "all_contacts" | "captured_email";

/** One-off DM blasts to a contact segment - its own tab, not a footnote on My Automations. */
export function BroadcastsScreen() {
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [segment, setSegment] = useState<Segment>("captured_email");
  const [scheduleStart, setScheduleStart] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  // Sending DMs a whole segment and cannot be undone, so the first press only
  // asks; the second (Confirm) actually starts it.
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, []);

  // Broadcasts go out ~1/second; poll while one is running so the sent/failed
  // counts move instead of freezing until a reload.
  const running = broadcasts.some((broadcast) => broadcast.status === "RUNNING" || broadcast.status === "PENDING");
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function refresh(signal?: AbortSignal) {
    try {
      const response = await fetch("/api/broadcasts", { signal });
      const payload = (await response.json().catch(() => ({}))) as { data?: BroadcastRow[]; error?: string };
      if (signal?.aborted) return;
      if (!response.ok) throw new Error(payload.error ?? "Could not load broadcasts.");
      setBroadcasts(payload.data ?? []);
      setLoadError("");
    } catch (caught) {
      if (signal?.aborted) return;
      setLoadError(caught instanceof Error ? caught.message : "Could not load broadcasts.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!name.trim() || !text.trim()) return setError("Give the broadcast a name and a message.");
    const scheduledFor = scheduleStart ? new Date(scheduleStart) : null;
    if (scheduledFor && Number.isNaN(scheduledFor.getTime())) return setError("Pick a valid schedule date.");
    // A past time used to fall through and send immediately.
    if (scheduledFor && scheduledFor.getTime() <= Date.now()) return setError("Pick a time in the future, or clear it to send now.");
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setSending(true);
    try {
      const response = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          text: text.trim(),
          segment,
          ...(scheduledFor && scheduledFor.getTime() > Date.now() ? { scheduleStart: scheduledFor.toISOString() } : {}),
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not start this broadcast.");
      }
      setName("");
      setText("");
      setScheduleStart("");
      setNotice(scheduledFor ? "Broadcast scheduled." : "Broadcast started - messages are going out now.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start this broadcast.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="automation-section">

        <div className="split-layout">
            <section className="surface is-flush" aria-label="Broadcast history">
              <div className="surface-head">
                <div className="surface-head-copy"><h2>{loading ? "Broadcasts" : `${broadcasts.length} ${broadcasts.length === 1 ? "broadcast" : "broadcasts"}`}</h2><p>Every blast you have sent or scheduled.</p></div>
              </div>
              <div className="surface-body">
              {loadError ? <p className="form-error" role="alert">{loadError} <button className="text-link" type="button" onClick={() => void refresh()}>Try again</button></p> : null}
              {loading && broadcasts.length === 0 ? <InlineContentSkeleton label="Loading broadcasts" rows={3} /> : !loading && broadcasts.length === 0 ? (
                <div className="empty-state is-inline">
                  <span className="empty-icon"><Megaphone size={20} /></span>
                  <h3>No broadcasts yet</h3>
                  <p>Compose one and it will show up here with its delivery counts.</p>
                </div>
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
              </div>
            </section>
            <form className="surface composer-card" onSubmit={send} aria-label="New broadcast">
              <div className="surface-head">
                <div className="surface-head-copy"><h2>New broadcast</h2><p>Compose once, send to a whole segment.</p></div>
              </div>
              <div className="surface-body">
              {error && <p className="form-error" role="alert">{error}</p>}
              {notice && <p className="form-success" role="status">{notice}</p>}
              <div className="field-stack">
                <label className="field">
                  <span>Name</span>
                  <input value={name} onChange={(e) => { setName(e.target.value); setConfirming(false); }} maxLength={120} placeholder="e.g. Weekend offer" />
                </label>
                <label className="field">
                  <span>Segment</span>
                  <select value={segment} onChange={(e) => { setSegment(e.target.value as Segment); setConfirming(false); }}>
                    <option value="captured_email">Leads with a captured email</option>
                    <option value="all_contacts">All known contacts</option>
                  </select>
                  <small className="muted">
                    Only people who messaged you in the last 24 hours receive a DM - Meta&apos;s
                    messaging window. Everyone else is skipped, never spammed.
                  </small>
                </label>
              </div>
              <label className="field field-spaced">
                <span>Message</span>
                <textarea value={text} onChange={(e) => { setText(e.target.value); setConfirming(false); }} rows={3} maxLength={1000} placeholder="Write the DM blast" />
              </label>
              <label className="field field-spaced">
                <span>Schedule start (optional)</span>
                <input type="datetime-local" value={scheduleStart} onChange={(e) => { setScheduleStart(e.target.value); setConfirming(false); }} />
                <small className="muted">Leave empty to fan out now. Delivery also waits out quiet hours automatically.</small>
              </label>
              <div className="composer-footer">
                {confirming ? (
                  <div className="broadcast-confirm" role="alert">
                    <p>
                      {scheduleStart ? "Schedule" : "Send"} this DM to{" "}
                      <strong>{segment === "captured_email" ? "every lead with a captured email" : "all known contacts"}</strong>?
                      {" "}This can’t be undone.
                    </p>
                    <div className="button-row">
                      <button className="button button-secondary" type="button" onClick={() => setConfirming(false)}>Cancel</button>
                      <button className="button button-primary" type="submit" disabled={sending}>
                        {scheduleStart ? "Confirm schedule" : "Confirm send"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button className="button button-primary" type="submit" disabled={sending}>
                    {sending ? "Starting…" : scheduleStart ? "Schedule broadcast" : "Send broadcast"}
                  </button>
                )}
              </div>
              </div>
            </form>
        </div>
      </div>
    </>
  );
}
