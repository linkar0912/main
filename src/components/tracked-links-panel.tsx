"use client";

import { Check, Copy, Link as LinkIcon, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { InlineContentSkeleton } from "./skeleton";
import { LocalRelativeTime, relativeTimeLabel } from "./workspace-primitives";

type Link = {
  id: string;
  slug: string;
  destination: string;
  expiresAt?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  conversionUrl?: string;
  notes?: string;
  createdAt: string;
};

type Stats = {
  totalClicks: number;
  uniqueClicks: number;
  lastClickedAt?: string;
  topCountries: { country: string; count: number }[];
};

function formatWhen(value: string | undefined): string {
  if (!value) return "No clicks yet";
  return relativeTimeLabel(value);
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "Campaign diwali_2026, from instagram (dm)" - the UTM tags in words. */
function tagLine(link: Link): string {
  const parts = [
    link.utmCampaign ? `campaign ${link.utmCampaign}` : "",
    link.utmSource ? `from ${link.utmSource}${link.utmMedium ? ` (${link.utmMedium})` : ""}` : "",
    link.expiresAt ? `expires ${lowerFirst(relativeTimeLabel(link.expiresAt))}` : "",
  ].filter(Boolean);
  const text = parts.join(", ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "No tracking tags";
}

const EMPTY_FORM = {
  slug: "",
  destination: "",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  expiresAt: "",
  conversionUrl: "",
  notes: "",
};

export function TrackedLinksPanel() {
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [statsFor, setStatsFor] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, Stats>>({});

  useEffect(() => {
    let active = true;
    let cancelled = false;
    void (async () => {
      if (!cancelled) setLoading(true);
      try {
        const response = await fetch("/api/links?limit=50");
        const payload = (await response.json().catch(() => ({}))) as { data?: Link[]; error?: string };
        if (cancelled) return;
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load tracked links");
        if (!active) return;
        setLinks(payload.data);
      } catch (caught: unknown) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load tracked links");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      active = false;
      cancelled = true;
    };
  }, []);

  async function createLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.slug.trim() || !form.destination.trim()) {
      setError("Slug and destination are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: form.slug.trim(),
          destination: form.destination.trim(),
          ...(form.utmSource.trim() ? { utmSource: form.utmSource.trim() } : {}),
          ...(form.utmMedium.trim() ? { utmMedium: form.utmMedium.trim() } : {}),
          ...(form.utmCampaign.trim() ? { utmCampaign: form.utmCampaign.trim() } : {}),
          ...(form.expiresAt ? { expiresAt: new Date(form.expiresAt).toISOString() } : {}),
          ...(form.conversionUrl.trim() ? { conversionUrl: form.conversionUrl.trim() } : {}),
          ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: Link; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not create the link");
      setLinks((current) => [payload.data!, ...current]);
      setForm(EMPTY_FORM);
      setShowForm(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the link");
    } finally {
      setSaving(false);
    }
  }

  async function loadStats(slug: string) {
    setError("");
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(slug)}/stats`);
      const payload = (await response.json().catch(() => ({}))) as { data?: Stats; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load stats");
      setStats((current) => ({ ...current, [slug]: payload.data! }));
      setStatsFor(slug);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load stats");
    }
  }

  async function removeLink(id: string, slug: string) {
    if (!confirm("Delete this tracked link? Past clicks are kept for the lifetime of the workspace.")) return;
    setError("");
    try {
      // The API addresses links by slug (/api/links/[slug]); sending the id
      // made every delete fail with "link not found".
      const response = await fetch(`/api/links/${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not delete the link");
      }
      setLinks((current) => current.filter((link) => link.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the link");
    }
  }

  return (
    <div className="tracked-links-stack">
      <div className="surface-head">
        <div className="surface-head-copy">
          <h2 id="tracked-links-heading">Tracked links</h2>
          <p>Short links that count clicks and tag where visitors came from.</p>
        </div>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => setShowForm((value) => !value)}
          aria-expanded={showForm}
        >
          {showForm ? "Cancel" : (<><Plus size={14} aria-hidden /> New link</>)}
        </button>
      </div>
      <div className="surface-body">
      {error && <p className="form-error" role="alert">{error}</p>}
      {showForm && (
        <form className="tracked-link-form" onSubmit={createLink}>
          <div className="field-grid">
            <label className="field">
              <span>Slug</span>
              <input
                value={form.slug}
                onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                placeholder="summer-sale"
                maxLength={41}
                required
              />
            </label>
            <label className="field">
              <span>Destination</span>
              <input
                value={form.destination}
                onChange={(event) => setForm((current) => ({ ...current, destination: event.target.value }))}
                placeholder="https://example.com/sale"
                required
                type="url"
              />
            </label>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>Source tag</span>
              <input
                value={form.utmSource}
                onChange={(event) => setForm((current) => ({ ...current, utmSource: event.target.value }))}
                placeholder="instagram"
              />
            </label>
            <label className="field">
              <span>Medium tag</span>
              <input
                value={form.utmMedium}
                onChange={(event) => setForm((current) => ({ ...current, utmMedium: event.target.value }))}
                placeholder="dm"
              />
            </label>
            <label className="field">
              <span>Campaign tag</span>
              <input
                value={form.utmCampaign}
                onChange={(event) => setForm((current) => ({ ...current, utmCampaign: event.target.value }))}
                placeholder="summer"
              />
            </label>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>Expires at (optional)</span>
              <input
                value={form.expiresAt}
                onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))}
                type="datetime-local"
              />
            </label>
            <label className="field">
              <span>Conversion URL (optional)</span>
              <input
                value={form.conversionUrl}
                onChange={(event) => setForm((current) => ({ ...current, conversionUrl: event.target.value }))}
                placeholder="https://example.com/conversions"
                type="url"
              />
            </label>
          </div>
          <label className="field">
            <span>Notes (optional)</span>
            <input
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Promo for the July campaign"
              maxLength={240}
            />
          </label>
          <button type="submit" className="button button-primary button-small" disabled={saving}>
            {saving ? "Saving…" : "Create link"}
          </button>
        </form>
      )}
      {loading ? (
        <InlineContentSkeleton label="Loading tracked links" rows={3} />
      ) : links.length === 0 ? (
        <p className="all-clear is-neutral">
          <LinkIcon size={15} aria-hidden /> No tracked links yet. Create one to count clicks from your DMs.
        </p>
      ) : (
        <ul className="tracked-link-list">
          {links.map((link) => {
            const statsEntry = stats[link.slug];
            return (
              <li key={link.id} className="tracked-link-row">
                <div className="tracked-link-copy">
                  <strong>/r/{link.slug}</strong>
                  <span className="tracked-link-destination" title={link.destination}>{link.destination}</span>
                  <small>{tagLine(link)}. Created <LocalRelativeTime value={link.createdAt} /></small>
                </div>
                <div className="tracked-link-actions">
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    onClick={() => {
                      // Confirm the copy; clipboard access can be blocked, so
                      // say so instead of failing silently.
                      navigator.clipboard.writeText(`${window.location.origin}/r/${link.slug}`)
                        .then(() => {
                          setCopiedSlug(link.slug);
                          window.setTimeout(() => setCopiedSlug((current) => (current === link.slug ? null : current)), 2000);
                        })
                        .catch(() => setError(`Couldn't copy - the link is ${window.location.origin}/r/${link.slug}`));
                    }}
                  >
                    {copiedSlug === link.slug ? <><Check size={14} aria-hidden /> Copied</> : <><Copy size={14} aria-hidden /> Copy URL</>}
                  </button>
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    onClick={() => void loadStats(link.slug)}
                    aria-expanded={statsFor === link.slug}
                  >
                    {statsFor === link.slug ? "Refresh stats" : "View stats"}
                  </button>
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    onClick={() => void removeLink(link.id, link.slug)}
                    aria-label={`Delete /r/${link.slug}`}
                  >
                    <Trash2 size={14} aria-hidden /> Delete
                  </button>
                </div>
                {statsFor === link.slug && statsEntry && (
                  <div className="tracked-link-stats">
                    <span className="tracked-link-stat"><strong>{statsEntry.totalClicks} clicks</strong></span>
                    <span className="tracked-link-stat"><strong>{statsEntry.uniqueClicks} unique</strong></span>
                    <span className="muted">{statsEntry.lastClickedAt ? `Last click ${lowerFirst(formatWhen(statsEntry.lastClickedAt))}` : formatWhen(undefined)}</span>
                    {statsEntry.topCountries.length > 0 && (
                      <p className="muted activity-summary">
                        Top countries: {statsEntry.topCountries.map((entry) => `${entry.country} (${entry.count})`).join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </div>
  );
}
