"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { InlineContentSkeleton } from "./skeleton";
import { SocialAvatar } from "./social-avatar";
import { loadTeamMembers, type TeamMember } from "@/src/lib/client/team-members";
import { formatDateTime } from "@/src/lib/format-date";

type LeadStatus = "NEW" | "ENGAGED" | "QUALIFIED" | "CUSTOMER";

type ContactDetail = {
  id: string;
  instagramUsername?: string;
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
  /** True while a handoff has automated messages paused for this person. */
  automationsPaused?: boolean;
};

/** Fields the Contacts table mirrors after an edit in the drawer. */
export type ContactUpdate = Partial<Pick<ContactDetail, "leadStatus" | "assigneeUserId" | "tags" | "score">>;

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

// Campaign participant states arrive raw (e.g. "OPENING_SENT").
const PARTICIPANT_STATE_LABELS: Record<string, string> = {
  COMMENT_MATCHED: "Comment matched",
  OPENING_SENT: "Opening DM sent",
  OPTED_IN: "Opted in",
  FOLLOW_REQUIRED: "Asked to follow",
  FOLLOW_VERIFIED: "Follow verified",
  LINK_SENT: "Link delivered",
  FAILED: "Delivery failed",
  EXPIRED: "Expired before finishing",
};

function timelineDetail(detail: string): string {
  if (PARTICIPANT_STATE_LABELS[detail]) return PARTICIPANT_STATE_LABELS[detail];
  if (/^[A-Z_]+$/.test(detail)) return detail.charAt(0) + detail.slice(1).toLowerCase().replaceAll("_", " ");
  return detail;
}

/**
 * Contact 360: profile chips, engagement score, editable manual tags, and the
 * interaction timeline. Automatic labels ("email_captured", "opted_out",
 * "clicked") are set by the engine and cannot be removed here.
 */
/** What the Contacts table already knows, so the drawer paints instantly. */
export type ContactPreview = Pick<ContactDetail, "id" | "instagramUsername" | "email" | "tags" | "score" | "leadStatus" | "assigneeUserId" | "lastSeenAt" | "createdAt" | "suppressedAt" | "state">;

export function ContactDetailModal({ contactId, initial, onClose, onUpdated }: {
  contactId: string;
  initial?: ContactPreview;
  onClose: () => void;
  /** Lets the Contacts table reflect stage, owner and tag edits without a refetch. */
  onUpdated?: (update: ContactUpdate) => void;
}) {
  const [contact, setContact] = useState<ContactDetail | null>(initial ?? null);
  // Notes, timeline and the pause flag only exist in the full record; editing
  // waits for it so a save can never blank notes that had not loaded yet.
  const [detailLoaded, setDetailLoaded] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [error, setError] = useState("");
  // The full record failed to load. Kept apart from `error` (a failed save)
  // so the panel can offer Retry instead of a skeleton that never resolves.
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [tagDraft, setTagDraft] = useState(initial?.tags.join(", ") ?? "");
  const [saving, setSaving] = useState<"" | "profile" | "tags" | "handoff" | "resume">("");
  const [notice, setNotice] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [statusDraft, setStatusDraft] = useState<LeadStatus>(initial?.leadStatus ?? "NEW");
  const [assigneeDraft, setAssigneeDraft] = useState(initial?.assigneeUserId ?? "");
  const [notesDraft, setNotesDraft] = useState("");
  const [profileDirty, setProfileDirty] = useState(false);
  const [showHandoffForm, setShowHandoffForm] = useState(false);
  const [handoffReason, setHandoffReason] = useState("");
  const [handoffPause, setHandoffPause] = useState(true);
  const contactLabel = contact?.instagramUsername
    ? `@${contact.instagramUsername.replace(/^@+/, "")}`
    : contact?.email ?? "Instagram contact";

  useEffect(() => {
    let active = true;
    fetch(`/api/contacts/${contactId}${initial?.instagramUsername ? "?profile=0" : ""}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          data?: { contact: ContactDetail; timeline: TimelineEntry[] };
          error?: string;
        };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load this contact");
        if (!active) return;
        // Keep the table's handle when the drawer skipped the lookup.
        setContact({ ...payload.data.contact, instagramUsername: payload.data.contact.instagramUsername ?? initial?.instagramUsername });
        setDetailLoaded(true);
        setTimeline(payload.data.timeline);
        setTagDraft(payload.data.contact.tags.join(", "));
        setStatusDraft(payload.data.contact.leadStatus);
        setAssigneeDraft(payload.data.contact.assigneeUserId ?? "");
        setNotesDraft(payload.data.contact.notes ?? "");
        setProfileDirty(false);
        setLoadError("");
      })
      .catch((caught: unknown) => {
        if (active) setLoadError(caught instanceof Error ? caught.message : "Could not load this contact");
      });
    return () => {
      active = false;
    };
    // `initial` is a first-paint hint for this contactId, not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, loadAttempt]);

  function retryLoad() {
    setLoadError("");
    setLoadAttempt((attempt) => attempt + 1);
  }

  useEffect(() => {
    let active = true;
    void loadTeamMembers().then((list) => { if (active) setMembers(list); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function saveTags() {
    if (!contact) return;
    const tags = tagDraft.split(",").map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean);
    setSaving("tags");
    setError("");
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: ContactDetail; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not save tags");
      setContact((current) => (current ? { ...current, tags: payload.data!.tags } : current));
      setTagDraft(payload.data.tags.join(", "));
      onUpdated?.({ tags: payload.data.tags });
      setNotice("Tags saved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save tags");
    } finally {
      setSaving("");
    }
  }

  async function saveProfile() {
    if (!contact) return;
    const trimmedAssignee = assigneeDraft.trim();
    const trimmedNotes = notesDraft.trim();
    setSaving("profile");
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
      onUpdated?.({ leadStatus: payload.data.leadStatus, assigneeUserId: payload.data.assigneeUserId, score: payload.data.score });
      setNotice("Profile saved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save profile");
    } finally {
      setSaving("");
    }
  }

  async function handoff() {
    if (!contact) return;
    const reason = handoffReason.trim();
    if (!reason) {
      setError("Add a short reason before handing this off.");
      return;
    }
    setSaving("handoff");
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
      const paused = handoffPause || Boolean(contact.automationsPaused);
      setContact((current) => (current ? { ...current, ...payload.data!.contact, automationsPaused: paused } : current));
      onUpdated?.({ assigneeUserId: payload.data.contact.assigneeUserId });
      setShowHandoffForm(false);
      setHandoffReason("");
      setProfileDirty(false);
      setNotice(handoffPause ? "Handed off - automations paused" : "Handed off");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not hand off this contact");
    } finally {
      setSaving("");
    }
  }

  async function resumeAutomations() {
    if (!contact) return;
    setSaving("resume");
    setError("");
    try {
      const response = await fetch(`/api/contacts/${contact.id}/handoff`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not resume automations");
      setContact((current) => (current ? { ...current, automationsPaused: false } : current));
      setNotice("Automations resumed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not resume automations");
    } finally {
      setSaving("");
    }
  }

  const knownAssignee = !assigneeDraft || members.some((member) => member.userId === assigneeDraft);

  return portal(
    // A side panel, not a modal: the list behind stays visible and clickable,
    // so picking another contact switches the panel instead of closing it.
    <div className="contact-detail-scrim" role="presentation">
      <div
        className="modal-panel contact-detail-drawer"
        role="dialog"
        aria-modal="false"
        aria-label="Contact details"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Always rendered: the drawer is full screen on phones, so the close
            button cannot wait for the record to load (or fail to). */}
        <header className="contact-detail-header">
          {contact ? <SocialAvatar channel="instagram" name={contactLabel} src={`/api/contacts/${contact.id}/avatar`} size="large" /> : <span aria-hidden="true" />}
          <div className="contact-detail-identity">
            <h2>{contact ? contactLabel : "Contact details"}</h2>
            {contact ? (
              <p className="muted">
                First seen {formatDateTime(contact.createdAt)} · Last seen {formatDateTime(contact.lastSeenAt)}
                {contact.suppressedAt ? " · Opted out" : ""}
              </p>
            ) : null}
          </div>
          <button className="icon-button" type="button" aria-label="Close contact details" onClick={onClose}><X size={16} /></button>
        </header>
        {loadError && (
          <div className="form-error contact-detail-load-error" role="alert">
            <span>{loadError}</span>
            <button className="button button-secondary button-small" type="button" onClick={retryLoad}>Retry</button>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-success contact-detail-notice" role="status">{notice}</p>}
        {!contact && !loadError && (
          <InlineContentSkeleton label="Loading contact details" rows={4} />
        )}
        {contact && (
          <>
            <div className="contact-chips contact-detail-chips">
              <span className="status-badge">Score {contact.score}</span>
              {contact.tags.map((tag) => (
                <span className="tag-chip" key={tag}>{tag}</span>
              ))}
            </div>

            <section className="contact-detail-section" aria-labelledby="contact-profile-title">
              <h3 id="contact-profile-title">Profile</h3>
            <div className="field-grid">
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
                <span>Owner</span>
                <select
                  aria-label="Assignee"
                  value={assigneeDraft}
                  onChange={(event) => {
                    setAssigneeDraft(event.target.value);
                    setProfileDirty(true);
                  }}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>{member.email}</option>
                  ))}
                  {!knownAssignee ? <option value={assigneeDraft}>Former member</option> : null}
                </select>
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
                disabled={!detailLoaded}
                placeholder="Follow up next week, prefers SMS, ..."
              />
            </label>
            <div className="button-row">
              <button
                className="button button-primary button-small"
                type="button"
                onClick={saveProfile}
                disabled={Boolean(saving) || !profileDirty || !detailLoaded}
              >
                {saving === "profile" ? "Saving…" : profileDirty ? "Save profile" : "Saved"}
              </button>
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={() => setShowHandoffForm((value) => !value)}
                disabled={Boolean(saving) || Boolean(contact.suppressedAt) || !detailLoaded}
                aria-expanded={showHandoffForm}
              >
                {showHandoffForm ? "Cancel handoff" : "Hand off to team"}
              </button>
            </div>
            {contact.automationsPaused ? (
              <div className="contact-paused-note" role="status">
                <span>Automated messages are paused for this person while your team handles the conversation.</span>
                <button className="button button-secondary button-small" type="button" onClick={resumeAutomations} disabled={Boolean(saving)}>
                  {saving === "resume" ? "Resuming…" : "Resume automations"}
                </button>
              </div>
            ) : null}
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
                  disabled={Boolean(saving) || !handoffReason.trim()}
                >
                  {saving === "handoff" ? "Saving…" : "Confirm handoff"}
                </button>
              </form>
            )}
            </section>

            <section className="contact-detail-section" aria-labelledby="contact-tags-title">
            <h3 id="contact-tags-title">Tags</h3>
            <label className="field field-spaced">
              <span>Comma separated <em>letters, numbers and dashes; automatic tags are kept</em></span>
              <input
                aria-label="Contact tags"
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                placeholder="vip, webinar-lead"
                maxLength={300}
              />
            </label>
            <button className="button button-secondary button-small" type="button" onClick={saveTags} disabled={Boolean(saving) || !detailLoaded}>
              {saving === "tags" ? "Saving…" : "Save tags"}
            </button>
            </section>

            <section className="contact-detail-section contact-detail-timeline" aria-labelledby="contact-timeline-title">
            <h3 id="contact-timeline-title">Timeline</h3>
            {!detailLoaded ? (
              loadError ? <p className="muted">The timeline could not load. Use Retry above.</p> : <InlineContentSkeleton label="Loading timeline" rows={2} />
            ) : timeline.length === 0 ? (
              <p className="muted">No interactions recorded yet.</p>
            ) : (
              <ul className="timeline-list">
                {timeline.map((entry) => (
                  <li key={entry.id}>
                    <div className="activity-row">
                      <span>{entry.label}</span>
                      <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                    </div>
                    {entry.detail && <p className="muted activity-summary">{timelineDetail(entry.detail)}</p>}
                  </li>
                ))}
              </ul>
            )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// Rendered on <body> so no page stacking context (the sticky mobile top bar,
// animated content slots) can paint over the panel.
function portal(node: ReactNode) {
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
