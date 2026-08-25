"use client";

import { useEffect, useState } from "react";

type ContactDetail = {
  id: string;
  email?: string;
  state: string;
  tags: string[];
  score: number;
  suppressedAt?: string;
  lastSeenAt: string;
  createdAt: string;
};

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
