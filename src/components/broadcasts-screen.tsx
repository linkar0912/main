"use client";

import { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { InlineContentSkeleton } from "./skeleton";
import { LocalStatusBadge, type StatusTone } from "./workspace-primitives";
import { toReadableApiError } from "@/src/lib/api-error-message";

type BroadcastRow = {
  id: string;
  name: string;
  text?: string;
  createdAt?: string;
  status: string;
  segment: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
};

type Segment = "all_contacts" | "captured_email";

type Audience = { eligible: number; queued: number; truncated: boolean };

/** The stored status values are machine words; people see these. */
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Scheduled",
  RUNNING: "Sending",
  COMPLETED: "Sent",
  CANCELLED: "Cancelled",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase();
}

function statusTone(status: string): StatusTone {
  if (status === "RUNNING") return "success";
  if (status === "PENDING") return "warning";
  if (status === "FAILED") return "danger";
  return "neutral";
}

function isCancellable(status: string): boolean {
  return status === "PENDING" || status === "RUNNING";
}

function audienceNotice(audience: Audience | undefined, scheduled: boolean): string {
  const lead = scheduled ? "Broadcast scheduled" : "Broadcast started";
  if (!audience) return scheduled ? "Broadcast scheduled." : "Broadcast started - messages are going out now.";
  if (audience.queued === 0) return `${lead}, but nobody messaged you in the last 24 hours, so there is no one to send it to.`;
  if (audience.truncated) {
    return `${lead} for the ${audience.queued.toLocaleString()} most recently active of ${audience.eligible.toLocaleString()} people in the 24-hour window. Send another broadcast to reach the rest.`;
  }
  return `${lead} for ${audience.queued.toLocaleString()} ${audience.queued === 1 ? "person" : "people"} in the 24-hour window.`;
}

function people(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "person" : "people"}`;
}

/**
 * Only "everyone skipped" is proof that nothing went out. `failed` also
 * counts deliveries whose outcome is unknown (Meta may have sent them), and
 * anyone not yet counted on a cancelled row may still be mid-send.
 */
function reachedNobody(row: BroadcastRow): boolean {
  return (row.status === "COMPLETED" || row.status === "CANCELLED") && row.sent === 0 && row.failed === 0 && row.skipped >= row.total;
}

/**
 * A listed broadcast with this same message from the last 24 hours (the
 * messaging window) that may have reached someone. The screen's memory of
 * earlier sends is gone after a reload or a visit to another tab; the list
 * is not.
 */
function recentSameMessage(rows: BroadcastRow[], text: string, now: number): BroadcastRow | undefined {
  return rows.find((row) => {
    if (row.text !== text || reachedNobody(row)) return false;
    const created = row.createdAt ? Date.parse(row.createdAt) : Number.NaN;
    return Number.isFinite(created) && now - created < 24 * 60 * 60 * 1000;
  });
}

/**
 * What a same-key retry should say, read from the broadcast the first try
 * made. "held": the server has it and it is going (or went) out, so the form
 * clears. "reached_nobody": every person was skipped before any attempt, so
 * a fresh send cannot message anyone twice. "stopped": some messages went
 * out, or may have, so sending it again could repeat them; the key stays
 * until an edit.
 */
function replayOutcome(row: BroadcastRow | undefined): { kind: "held" | "reached_nobody" | "stopped"; message: string } {
  const lead = "An earlier try of this broadcast";
  if (!row) return { kind: "held", message: `${lead} was already started, so it was not sent again. Its progress is in the list.` };
  const failedNote = row.failed > 0 ? ` ${people(row.failed)} could not be messaged.` : "";
  if (row.status === "COMPLETED" && row.total === 0) {
    return { kind: "held", message: `${lead} already went through, with nobody in the 24-hour window to send it to.` };
  }
  if ((row.status === "COMPLETED" || row.status === "CANCELLED") && row.sent === 0) {
    if (reachedNobody(row)) {
      return { kind: "reached_nobody", message: `${lead} reached nobody, so nothing went out. Send it again to try once more.` };
    }
    return {
      kind: "stopped",
      message: `${lead} could not confirm whether its messages went out, so it was not sent again in case some people already have it. Change the message to send a new one.`,
    };
  }
  if (row.status === "CANCELLED") {
    return {
      kind: "stopped",
      message: `${lead} was cancelled after some messages went out, so it was not sent again. Change the message to send a new one.`,
    };
  }
  if (row.status === "PENDING") return { kind: "held", message: `${lead} is already scheduled, so it was not scheduled again.` };
  if (row.status === "RUNNING") {
    return { kind: "held", message: `${lead} is already sending, so it was not sent again. Its progress is in the list.${failedNote}` };
  }
  return { kind: "held", message: `${lead} already went out to ${people(row.sent)}, so it was not sent again.${failedNote}` };
}

/** What the earlier send under this key is doing, for the alerts below. */
function earlierSendState(row: BroadcastRow): string {
  if (row.status === "PENDING") return "is scheduled";
  if (row.status === "RUNNING") return "is going out now";
  if (row.status === "CANCELLED") return "was cancelled";
  if (row.total === 0) return "went through with nobody in the 24-hour window to send it to";
  if (row.sent > 0) return `went out to ${people(row.sent)}`;
  return "has finished";
}

/**
 * A replay brought back an earlier send with a different message: the
 * edited message was not sent. Saying "already sending" and clearing the
 * form would lose it without a word.
 */
function editedMessageNotSent(row: BroadcastRow): string {
  return `Your earlier send, “${row.name}”, ${earlierSendState(row)}, so this edited message was not sent. Check the list, then send again to start the edited message as a new broadcast.`;
}

/**
 * A replay brought back an earlier send of this same message with another
 * name, audience or start time. Sending it again would message people who
 * already have it, so the changes are not applied and the key stays.
 */
function changesNotApplied(row: BroadcastRow): string {
  // Cancelling a scheduled send before it starts reaches nobody, so a fresh
  // send can follow. Once one has started, some people have it.
  const next = row.status === "PENDING"
    ? "To change who gets it or when, cancel it in the list first, or change the message."
    : "To send something new, change the message.";
  return `Your earlier send of this message, “${row.name}”, ${earlierSendState(row)}, so your changes to its name, audience or start time were not applied. Sending it again would message the same people twice. ${next}`;
}

/** The start time changed while answers were lost, so which one was stored is not known. */
function startTimeUnconfirmed(row: BroadcastRow): string {
  return `Your earlier send of this message, “${row.name}”, is scheduled, but its start time changed while answers were lost, so the time it was stored with is not confirmed. To be sure of the time, cancel it in the list and send it again.`;
}

/** Shown when the answer to a send was lost, so the screen cannot say whether it started. */
const UNCONFIRMED_SEND = "We could not confirm whether this broadcast started. Check the list of your broadcasts before sending again.";

function newSendKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

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
  // Cancelling also asks once: messages already sent stay sent.
  const [confirmCancelId, setConfirmCancelId] = useState("");
  const [cancellingId, setCancellingId] = useState("");
  // One key per broadcast the person means to send, sent as the
  // idempotency-key header. While the server holds no broadcast for it,
  // reusing it is harmless (that try creates the broadcast from what it
  // posts), so edits keep it. Once the server may hold one, a retry with the
  // key gets that broadcast back instead of messaging everyone again. A new
  // key starts only after a confirmed send, when the server says nobody was
  // messaged, or when the message differs from the one the server holds.
  const sendKeyRef = useRef<string | null>(null);
  // Set when a send may have started but no answer said how it went: a
  // gateway error page, a dropped connection, a server error, or an answer
  // that could not be read. The next send reuses the key whatever was edited,
  // and the replay says what the server holds.
  const outcomeUnknownRef = useRef(false);
  // The message of the broadcast the server is known to hold for the key
  // (null when none is known). A send with another message starts a new key.
  const heldTextRef = useRef<string | null>(null);
  // The start times posted while the outcome was unknown. The stored
  // broadcast has no start time to compare a replay against; with more than
  // one, which was stored is not known.
  const unknownSchedulesRef = useRef(new Set<string>());
  // The messages posted while the outcome was unknown. Only those can be
  // held for the key; any other message may be created as a new broadcast.
  const unknownTextsRef = useRef(new Set<string>());
  // Shown in the confirm step when the list holds this same message from the
  // last 24 hours, so a second send is a warned choice.
  const [repeatWarning, setRepeatWarning] = useState("");

  function dropKey() {
    sendKeyRef.current = null;
    outcomeUnknownRef.current = false;
    heldTextRef.current = null;
    unknownSchedulesRef.current = new Set();
    unknownTextsRef.current = new Set();
  }

  function edited() {
    setConfirming(false);
    setRepeatWarning("");
  }

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
      // A rejected fetch (TypeError) carries the browser's own words, such as "Failed to fetch".
      setLoadError(caught instanceof Error && !(caught instanceof TypeError) ? caught.message : "Could not load broadcasts.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  async function cancelBroadcast(id: string) {
    if (confirmCancelId !== id) {
      setConfirmCancelId(id);
      return;
    }
    setConfirmCancelId("");
    setCancellingId(id);
    setLoadError("");
    try {
      const response = await fetch(`/api/broadcasts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(toReadableApiError(payload.error, "Could not cancel this broadcast."));
      setNotice("Broadcast cancelled. Messages already sent stay sent.");
      await refresh();
    } catch (caught) {
      setLoadError(caught instanceof Error && !(caught instanceof TypeError) ? caught.message : "Could not cancel this broadcast.");
    } finally {
      setCancellingId("");
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
      // A send that reuses the key replays what the server holds, so it
      // cannot repeat anything; any other send is a new broadcast.
      const message = text.trim();
      const replays =
        (outcomeUnknownRef.current && unknownTextsRef.current.has(message)) ||
        (sendKeyRef.current !== null && heldTextRef.current === message);
      const earlier = replays ? undefined : recentSameMessage(broadcasts, message, Date.now());
      setRepeatWarning(earlier
        ? `You already sent this same message in the last 24 hours, as “${earlier.name}”. Sending it again would message anyone in both audiences twice.`
        : "");
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setRepeatWarning("");
    setSending(true);
    const schedule = scheduledFor && scheduledFor.getTime() > Date.now() ? scheduledFor.toISOString() : "";
    const posted = { name: name.trim(), text: text.trim(), segment };
    // Another message than the one the server holds for this key is a new broadcast.
    if (!outcomeUnknownRef.current && heldTextRef.current !== null && heldTextRef.current !== posted.text) dropKey();
    const sendKey = (sendKeyRef.current ??= newSendKey());
    // The broadcast may be going out: keep the key for the next send whatever
    // is edited, and show the list.
    const outcomeUnknown = () => {
      outcomeUnknownRef.current = true;
      unknownSchedulesRef.current.add(schedule);
      unknownTextsRef.current.add(posted.text);
      void refresh();
    };
    try {
      const response = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": sendKey },
        body: JSON.stringify({ ...posted, ...(schedule ? { scheduleStart: schedule } : {}) }),
      }).catch(() => null);
      if (!response) {
        // The connection dropped, possibly after the server stored and queued the broadcast.
        outcomeUnknown();
        throw new Error(UNCONFIRMED_SEND);
      }
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        audience?: Audience;
        data?: BroadcastRow;
        replayed?: boolean;
        queued?: number;
      };
      if (!response.ok) {
        const readable = typeof payload.error === "string" && payload.error.trim() !== "";
        if (payload.queued === 0) {
          // The server queued nobody (the queue did not answer, or nothing
          // could be stored), so the next try may start a fresh broadcast.
          dropKey();
          if (payload.data) void refresh();
        } else if (!readable || response.status >= 500) {
          // A gateway error page (502/504/524), an empty server error, or a
          // server error that may come after the broadcast was stored (a
          // partial send).
          outcomeUnknown();
        } else if (payload.data || outcomeUnknownRef.current) {
          void refresh();
        }
        throw new Error(readable ? toReadableApiError(payload.error, "Could not start this broadcast.") : UNCONFIRMED_SEND);
      }
      const row = payload.data;
      if (!row) {
        // Every answer that went through carries the broadcast. One that
        // cannot be read says nothing about what happened to this key.
        outcomeUnknown();
        throw new Error(UNCONFIRMED_SEND);
      }
      // The server said what happened to this key.
      outcomeUnknownRef.current = false;
      let message = audienceNotice(payload.audience, Boolean(schedule));
      if (payload.replayed) {
        heldTextRef.current = row.text ?? null;
        const outcome = replayOutcome(row);
        if (row.text !== undefined && row.text !== posted.text) {
          // The next send has another message than the held one, so it starts a new broadcast.
          void refresh();
          throw new Error(editedMessageNotSent(row));
        }
        if (outcome.kind === "reached_nobody") {
          // Everyone was skipped, so a new key cannot message anyone twice.
          dropKey();
          void refresh();
          throw new Error(outcome.message);
        }
        const schedules = unknownSchedulesRef.current;
        if (row.status === "PENDING" && schedules.size > 1) {
          // Still to start, at a time that is not confirmed. The key stays.
          void refresh();
          throw new Error(startTimeUnconfirmed(row));
        }
        const otherChanges =
          row.name !== posted.name ||
          row.segment !== posted.segment ||
          (schedules.size === 1 && !schedules.has(schedule));
        if (otherChanges || outcome.kind === "stopped") {
          // Some messages went out, or may have. The key stays, so pressing
          // again replays, until the message changes.
          void refresh();
          throw new Error(otherChanges ? changesNotApplied(row) : outcome.message);
        }
        message = outcome.message;
      }
      dropKey();
      setName("");
      setText("");
      setScheduleStart("");
      setNotice(message);
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
                <div className="surface-head-copy"><h2>Your broadcasts</h2><p>{loading || broadcasts.length === 0 ? "Everything you’ve sent or scheduled." : `${broadcasts.length} sent or scheduled.`}</p></div>
              </div>
              <div className="surface-body">
              {loadError ? <p className="form-error" role="alert">{loadError} <button className="text-link" type="button" onClick={() => void refresh()}>Try again</button></p> : null}
              {loading && broadcasts.length === 0 ? <InlineContentSkeleton label="Loading broadcasts" rows={3} /> : !loading && broadcasts.length === 0 ? (
                <div className="empty-state is-inline">
                  <span className="empty-icon"><Megaphone size={20} /></span>
                  <h3>No broadcasts yet</h3>
                  <p>Write one in the form. It shows up here with how many people got it.</p>
                </div>
              ) : (
                <div className="automation-list">
                  {broadcasts.map((broadcast) => (
                    <article className="automation-row" key={broadcast.id}>
                      <div className="automation-icon"><Megaphone size={19} strokeWidth={1.7} /></div>
                      <div className="automation-copy">
                        <div className="automation-title">
                          <strong>{broadcast.name}</strong>
                          <LocalStatusBadge tone={statusTone(broadcast.status)} label={statusLabel(broadcast.status)} />
                        </div>
                        <p>
                          {broadcast.sent.toLocaleString()} of {broadcast.total.toLocaleString()} sent
                          {broadcast.failed > 0 ? ` · ${broadcast.failed.toLocaleString()} failed` : ""}
                          {broadcast.skipped > 0 ? ` · ${broadcast.skipped.toLocaleString()} skipped` : ""}
                        </p>
                        {broadcast.status === "RUNNING" && broadcast.total > 0 ? (
                          // A live broadcast shows how far along it is, not just two numbers.
                          <span
                            className="broadcast-progress"
                            role="progressbar"
                            aria-label={`${broadcast.name} progress`}
                            aria-valuemin={0}
                            aria-valuemax={broadcast.total}
                            aria-valuenow={broadcast.sent + broadcast.failed + broadcast.skipped}
                          >
                            <span style={{ width: `${Math.min(100, Math.round(((broadcast.sent + broadcast.failed + broadcast.skipped) / broadcast.total) * 100))}%` }} />
                          </span>
                        ) : null}
                      </div>
                      {isCancellable(broadcast.status) && (
                        <div className="button-row">
                          {confirmCancelId === broadcast.id && (
                            <button className="button button-secondary button-small" type="button" onClick={() => setConfirmCancelId("")}>
                              Keep sending
                            </button>
                          )}
                          <button
                            className="button button-secondary button-small"
                            type="button"
                            disabled={cancellingId === broadcast.id}
                            aria-label={confirmCancelId === broadcast.id ? `Confirm cancelling ${broadcast.name}` : `Cancel ${broadcast.name}`}
                            onClick={() => void cancelBroadcast(broadcast.id)}
                          >
                            {cancellingId === broadcast.id ? "Cancelling…" : confirmCancelId === broadcast.id ? "Confirm cancel" : "Cancel"}
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
              </div>
            </section>
            <form className="surface composer-card" id="new-broadcast" onSubmit={send} aria-label="New broadcast">
              <div className="surface-head">
                <div className="surface-head-copy"><h2>New broadcast</h2><p>Write one message and send it to a group of contacts.</p></div>
              </div>
              <div className="surface-body">
              {notice && <p className="form-success" role="status">{notice}</p>}
              <div className="field-stack">
                <label className="field">
                  <span>Name</span>
                  <input disabled={sending} value={name} onChange={(e) => { setName(e.target.value); edited(); }} maxLength={120} placeholder="e.g. Weekend offer" />
                </label>
                <label className="field">
                  <span>Send to</span>
                  <select disabled={sending} value={segment} onChange={(e) => { setSegment(e.target.value as Segment); edited(); }}>
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
                <textarea disabled={sending} value={text} onChange={(e) => { setText(e.target.value); edited(); }} rows={3} maxLength={1000} placeholder="Write the message everyone will get" />
                {/* Non-blocking: a broadcast is one text for many people, so nudge toward fewer, more useful ones. */}
                <small className="muted" role="note">
                  Sending the same text to many people can look repetitive. Keep broadcasts relevant to the
                  people getting them, and send them only now and then.
                </small>
              </label>
              <label className="field field-spaced">
                <span>Start at (optional)</span>
                <input disabled={sending} type="datetime-local" value={scheduleStart} onChange={(e) => { setScheduleStart(e.target.value); edited(); }} />
                <small className="muted">Leave empty to start now. Sending also waits out your quiet hours.</small>
              </label>
              <div className="composer-footer">
                {/* Next to the button that raised it, so it can't be missed below the fold. */}
                {error && <p className="form-error" role="alert">{error}</p>}
                {confirming ? (
                  <div className="broadcast-confirm" role="alert">
                    {repeatWarning ? <p>{repeatWarning}</p> : null}
                    <p>
                      {scheduleStart ? "Schedule" : "Send"} this DM to{" "}
                      <strong>{segment === "captured_email" ? "every lead with a captured email" : "all known contacts"}</strong>?
                      {" "}This can’t be undone.
                    </p>
                    <div className="button-row">
                      <button className="button button-secondary" type="button" onClick={edited}>Cancel</button>
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
