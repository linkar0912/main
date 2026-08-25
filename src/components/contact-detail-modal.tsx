"use client";

import { useEffect, useState } from "react";

type LeadStatus = "NEW" | "ENGAGED" | "QUALIFIED" | "CUSTOMER";

type ContactDetail = {
  id: string;
  email?: string;
  state: string;
  tags: string[];
  score: number;
  leadStatus: LeadStatus;
  assigneeUserId?: string;
  notes?: string;
  sourceAutomationId?: string;
  suppressedAt?: string;
  lastSeenAt: string;
  createdAt: string;
};

const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  ENGAGED: "Engaged",
  QUALIFIED: "Qualified",
  CUSTOMER: "Customer",
};

const LEAD_STATUS_ORDER: LeadStatus[] = ["NEW", "ENGAGED", "QUALIFIED", "CUSTOMER"];

type TimelineEntry = {
  id: string;
  kind: string;
  at: string;
  label: string;
  detail?: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Contact 360: profile chips, engagement score, editable manual tags, and the
 * interaction timeline. Automatic labels ("email_captured", "opted_out",
 * "clicked") are set by the engine and cannot be removed here.
 */
export function ContactDetailModal({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [error, setError] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusDraft, setStatusDraft] = useState<LeadStatus>("NEW");
  const [assigneeDraft, setAssigneeDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [profileDirty, setProfileDirty] = useState(false);
  const [showHandoffForm, setShowHandoffForm] = useState(false);
  const [handoffReason, setHandoffReason] = useState("");
  const [handoffPause, setHandoffPause] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`/api/contacts/${contactId}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          data?: { contact: ContactDetail; timeline: TimelineEntry[] };
          error?: string;
        };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load this contact");
        if (!active) return;
        setContact(payload.data.contact);
        setTimeline(payload.data.timeline);
        setTagDraft(payload.data.contact.tags.join(", "));
        setStatusDraft(payload.data.contact.leadStatus);
        setAssigneeDraft(payload.data.contact.assigneeUserId ?? "");
        setNotesDraft(payload.data.contact.notes ?? "");
        setProfileDirty(false);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load this contact");
      });
    return () => {
      active = false;
    };
  }, [contactId]);

  async function saveTags() {
    if (!contact) return;
    const tags = tagDraft.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean);
    setSaving(true);
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: ContactDetail; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not save tags");
      setContact((current) => (current ? { ...current, tags: payload.data!.tags } : current));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save tags");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    if (!contact) return;
    const trimmedAssignee = assigneeDraft.trim();
    const trimmedNotes = notesDraft.trim();
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = { leadStatus: statusDraft };
      body.assigneeUserId = trimmedAssignee || null;
      body.notes = trimmedNotes || null;
      const response = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { leadStatus: LeadStatus; assigneeUserId?: string; notes?: string; score: number };
        error?: string;
      };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not save profile");
      setContact((current) => (
        current
          ? {
              ...current,
              leadStatus: payload.data!.leadStatus,
              assigneeUserId: payload.data!.assigneeUserId,
              notes: payload.data!.notes,
              score: payload.data!.score,
            }
          : current
      ));
      setStatusDraft(payload.data!.leadStatus);
      setAssigneeDraft(payload.data!.assigneeUserId ?? "");
      setNotesDraft(payload.data!.notes ?? "");
      setProfileDirty(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  async function handoff() {
    if (!contact) return;
    const reason = handoffReason.trim();
    if (!reason) {
      setError("Add a short reason before handing this off.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/contacts/${contact.id}/handoff`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason,
          pauseAutomations: handoffPause,
          assigneeUserId: assigneeDraft.trim() || null,
          notes: notesDraft.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { pausedCount: number; contact: ContactDetail };
        error?: string;
      };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not hand off this contact");
      setContact((current) => (current ? { ...current, ...payload.data!.contact } : current));
      setShowHandoffForm(false);
      setHandoffReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not hand off this contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-scrim" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Contact details"
        onClick={(event) => event.stopPropagation()}
        style={{ padding: "var(--space-6)" }}
      >
        {error && <p className="form-error" role="alert">{error}</p>}
        {!contact && !error && (
          <div className="empty-state"><div className="loading-line" /><div className="loading-line short" /></div>
        )}
        {contact && (
          <>
            <div className="list-intro">
              <div>
                <p className="eyebrow">Contact</p>
                <h2>{contact.email ?? `@${contact.id.slice(-6)}`}</h2>
                <p className="muted">
                  First seen {formatDate(contact.createdAt)} · Last seen {formatDate(contact.lastSeenAt)}
                  {contact.suppressedAt ? " · Opted out" : ""}
                </p>
              </div>
              <button className="icon-button" type="button" aria-label="Close contact details" onClick={onClose}>✕</button>
            </div>

            <div className="contact-chips">
              <span className="status-badge">Score {contact.score}</span>
              {contact.tags.map((tag) => (
                <span className="tag-chip" key={tag}>{tag}</span>
              ))}
            </div>

            <div className="field-grid field-spaced">
              <label className="field">
                <span>Pipeline stage</span>
                <select
                  aria-label="Lead status"
                  value={statusDraft}
                  onChange={(event) => {
                    setStatusDraft(event.target.value as LeadStatus);
                    setProfileDirty(true);
                  }}
                >
                  {LEAD_STATUS_ORDER.map((value) => (
                    <option key={value} value={value}>{LEAD_STATUS_LABELS[value]}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Assignee <em>team member id or email</em></span>
                <input
                  aria-label="Assignee"
                  value={assigneeDraft}
                  onChange={(event) => {
                    setAssigneeDraft(event.target.value);
                    setProfileDirty(true);
                  }}
                  placeholder="alex@team.com"
                  maxLength={64}
                />
              </label>
            </div>
            <label className="field field-spaced">
              <span>Internal notes</span>
              <textarea
                aria-label="Internal notes"
                value={notesDraft}
                onChange={(event) => {
                  setNotesDraft(event.target.value);
                  setProfileDirty(true);
                }}
                rows={3}
                maxLength={4000}
                placeholder="Follow up next week, prefers SMS, ..."
              />
            </label>
            <div className="button-row">
              <button
                className="button button-primary button-small"
                type="button"
                onClick={saveProfile}
                disabled={saving || !profileDirty}
              >
                {saving ? "Saving…" : profileDirty ? "Save profile" : "Profile saved"}
              </button>
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={() => setShowHandoffForm((value) => !value)}
                disabled={saving || Boolean(contact.suppressedAt)}
                aria-expanded={showHandoffForm}
              >
                {showHandoffForm ? "Cancel handoff" : "Hand off to team"}
              </button>
            </div>
            {showHandoffForm && (
              <form
                className="field-spaced"
                onSubmit={async (event) => {
                  event.preventDefault();
                  await handoff();
                }}
              >
                <label className="field">
                  <span>Why are you taking this conversation?</span>
                  <textarea
                    aria-label="Handoff reason"
                    value={handoffReason}
                    onChange={(event) => setHandoffReason(event.target.value)}
                    rows={2}
                    maxLength={500}
                    required
                    placeholder="Premium customer, asked for refund, ..."
                  />
                </label>
                <label className="field-row">
                  <input
                    type="checkbox"
                    checked={handoffPause}
                    onChange={(event) => setHandoffPause(event.target.checked)}
                  />
                  <span>Pause automated messages until I resume this contact</span>
                </label>
                <button
                  className="button button-primary button-small"
                  type="submit"
                  disabled={saving || !handoffReason.trim()}
                >
                  {saving ? "Saving…" : "Confirm handoff"}
                </button>
              </form>
            )}

            <label className="field field-spaced">
              <span>Tags <em>comma separated - automatic tags are kept</em></span>
              <input
                aria-label="Contact tags"
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                placeholder="vip, webinar-lead"
                maxLength={300}
              />
            </label>
            <button className="button button-secondary button-small" type="button" onClick={saveTags} disabled={saving}>
              {saving ? "Saving…" : "Save tags"}
            </button>

            <p className="eyebrow field-spaced">Timeline</p>
            {timeline.length === 0 ? (
              <p className="muted">No interactions recorded yet.</p>
            ) : (
              <ul className="timeline-list">
                {timeline.map((entry) => (
                  <li key={entry.id}>
                    <div className="activity-row">
                      <span>{entry.label}</span>
                      <time dateTime={entry.at}>{formatDate(entry.at)}</time>
                    </div>
                    {entry.detail && <p className="muted activity-summary">{entry.detail}</p>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
