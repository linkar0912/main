"use client";

import { Copy, Link as LinkIcon, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { InlineContentSkeleton } from "./skeleton";

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

function formatDate(value: string | undefined): string {
  if (!value) return "Not available";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [origin, setOrigin] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  });

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

  async function removeLink(id: string) {
    if (!confirm("Delete this tracked link? Past clicks are kept for the lifetime of the workspace.")) return;
    setError("");
    try {
      const response = await fetch(`/api/links/${encodeURIComponent(id)}`, { method: "DELETE" });
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
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Attribution</p>
          <h2>Tracked links</h2>
          <p className="muted">Branded /r/&lt;slug&gt; URLs with UTM tagging and click counts.</p>
        </div>
        <button
          type="button"
          className="button button-primary button-small"
          onClick={() => setShowForm((value) => !value)}
          aria-expanded={showForm}
        >
          {showForm ? "Cancel" : (<><Plus size={14} /> New link</>)}
        </button>
      </div>
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
              <span>utm_source</span>
              <input
                value={form.utmSource}
                onChange={(event) => setForm((current) => ({ ...current, utmSource: event.target.value }))}
                placeholder="instagram"
              />
            </label>
            <label className="field">
              <span>utm_medium</span>
              <input
                value={form.utmMedium}
                onChange={(event) => setForm((current) => ({ ...current, utmMedium: event.target.value }))}
                placeholder="dm"
              />
            </label>
            <label className="field">
              <span>utm_campaign</span>
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
              <span>Conversion callback (optional)</span>
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
        <p className="muted">
          <LinkIcon size={14} /> No tracked links yet. Add one to start counting clicks and tagging UTMs.
        </p>
      ) : (
        <ul className="tracked-link-list">
          {links.map((link) => {
            const fullUrl = `${origin}/r/${link.slug}`;
            const statsEntry = stats[link.slug];
            return (
              <li key={link.id}>
                <div className="activity-row">
                  <span><strong>/r/{link.slug}</strong> &middot; {link.destination}</span>
                  <span className="muted">{formatDate(link.createdAt)}</span>
                </div>
                <p className="muted activity-summary">
                  {link.utmCampaign ? `Campaign: ${link.utmCampaign} · ` : ""}
                  {link.utmSource ? `Source: ${link.utmSource} · ` : ""}
                  {link.utmMedium ? `Medium: ${link.utmMedium}` : ""}
                  {link.expiresAt ? ` · Expires ${formatDate(link.expiresAt)}` : ""}
                </p>
                <div className="button-row">
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(fullUrl);
                    }}
                  >
                    <Copy size={14} /> Copy URL
                  </button>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={() => void loadStats(link.slug)}
                    aria-expanded={statsFor === link.slug}
                  >
                    {statsFor === link.slug ? "Refresh stats" : "View stats"}
                  </button>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={() => void removeLink(link.id)}
                    aria-label={`Delete /r/${link.slug}`}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
                {statsFor === link.slug && statsEntry && (
                  <div className="tracked-link-stats">
                    <span className="status-badge">{statsEntry.totalClicks} clicks</span>
                    <span className="status-badge">{statsEntry.uniqueClicks} unique</span>
                    <span className="muted">Last click {formatDate(statsEntry.lastClickedAt)}</span>
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
  );
}
