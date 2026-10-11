"use client";

import { Check, Copy, Link as LinkIcon, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { InlineConfirm } from "./inline-confirm";
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

/** "IN" -> "India"; falls back to the code where the runtime has no names. */
function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en-IN"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`;
}

/** Slugs end up in a URL: letters, numbers and dashes read best. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

type FieldErrors = Partial<Record<"slug" | "destination", string>>;

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
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [deletingId, setDeletingId] = useState("");
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
      if (!cancelled) {
        setLoading(true);
        setLoadError("");
      }
      try {
        const response = await fetch("/api/links?limit=50");
        const payload = (await response.json().catch(() => ({}))) as { data?: Link[]; error?: string };
        if (cancelled) return;
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load tracked links");
        if (!active) return;
        setLinks(payload.data);
      } catch (caught: unknown) {
        if (!cancelled) setLoadError(caught instanceof Error ? caught.message : "Could not load tracked links");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      active = false;
      cancelled = true;
    };
  }, [reloadKey]);

  async function createLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Each problem sits under its own field, where the eye already is.
    const slug = form.slug.trim().replace(/^\/?r\//, "");
    const nextErrors: FieldErrors = {};
    if (!slug) nextErrors.slug = "Give the link a short name, like summer-sale.";
    else if (!SLUG_PATTERN.test(slug)) nextErrors.slug = "Use only letters, numbers and dashes.";
    if (!form.destination.trim()) nextErrors.destination = "Add the page this link should open.";
    setFieldErrors(nextErrors);
    if (nextErrors.slug || nextErrors.destination) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
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
      setFieldErrors({});
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
    setError("");
    setDeletingId(id);
    try {
      // The API addresses links by slug (/api/links/[slug]); sending the id
      // made every delete fail with "link not found".
      const response = await fetch(`/api/links/${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not delete the link");
      }
      setLinks((current) => current.filter((link) => link.id !== id));
      setConfirmDeleteId("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the link");
    } finally {
      setDeletingId("");
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
          onClick={() => { setShowForm((value) => !value); setFieldErrors({}); }}
          aria-expanded={showForm}
        >
          {showForm ? "Cancel" : (<><Plus size={14} aria-hidden /> New link</>)}
        </button>
      </div>
      <div className="surface-body">
      {error && <p className="form-error" role="alert">{error}</p>}
      {showForm && (
        <form className="tracked-link-form" onSubmit={createLink} noValidate>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="tracked-link-slug">Short link</label>
              <span className={`tracked-link-slug-input${fieldErrors.slug ? " has-error" : ""}`}>
                <span className="tracked-link-slug-prefix" aria-hidden>/r/</span>
                <input
                  id="tracked-link-slug"
                  value={form.slug}
                  onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
                  placeholder="summer-sale"
                  maxLength={41}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={fieldErrors.slug ? true : undefined}
                  aria-describedby={fieldErrors.slug ? "tracked-link-slug-error" : undefined}
                  required
                />
              </span>
              {fieldErrors.slug ? <small className="field-error" id="tracked-link-slug-error">{fieldErrors.slug}</small> : null}
            </div>
            <div className="field">
              <label htmlFor="tracked-link-destination">Opens this page</label>
              <input
                id="tracked-link-destination"
                value={form.destination}
                onChange={(event) => setForm((current) => ({ ...current, destination: event.target.value }))}
                placeholder="https://example.com/sale"
                inputMode="url"
                autoCapitalize="none"
                autoComplete="url"
                aria-invalid={fieldErrors.destination ? true : undefined}
                aria-describedby={fieldErrors.destination ? "tracked-link-destination-error" : undefined}
                required
                type="url"
              />
              {fieldErrors.destination ? <small className="field-error" id="tracked-link-destination-error">{fieldErrors.destination}</small> : null}
            </div>
          </div>
          <div className="field-grid tracked-link-tags">
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
                inputMode="url"
                autoCapitalize="none"
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
          <div className="tracked-link-form-actions">
            <button type="submit" className="button button-primary" disabled={saving}>
              {saving ? "Creating…" : "Create link"}
            </button>
          </div>
        </form>
      )}
      {loading ? (
        <InlineContentSkeleton label="Loading tracked links" rows={3} />
      ) : loadError ? (
        <div className="panel-state" role="alert">
          <p>Tracked links didn’t load: {loadError}</p>
          <button className="button button-secondary button-small" type="button" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw size={15} aria-hidden /> Try again
          </button>
        </div>
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
                    className="button button-ghost button-small tracked-link-delete"
                    type="button"
                    onClick={() => setConfirmDeleteId(link.id)}
                    aria-label={`Delete /r/${link.slug}`}
                    aria-expanded={confirmDeleteId === link.id}
                  >
                    <Trash2 size={14} aria-hidden /> Delete
                  </button>
                </div>
                {confirmDeleteId === link.id ? (
                  <InlineConfirm
                    label={`Confirm deleting /r/${link.slug}`}
                    message={<>Delete <strong>/r/{link.slug}</strong>? The short link stops working. Past clicks stay in your reports.</>}
                    confirmLabel="Delete link"
                    busyLabel="Deleting…"
                    busy={deletingId === link.id}
                    onConfirm={() => void removeLink(link.id, link.slug)}
                    onCancel={() => setConfirmDeleteId("")}
                  />
                ) : null}
                {statsFor === link.slug && statsEntry && (
                  <div className="tracked-link-stats">
                    <span className="tracked-link-stat"><strong>{plural(statsEntry.totalClicks, "click", "clicks")}</strong></span>
                    <span className="tracked-link-stat"><strong>{plural(statsEntry.uniqueClicks, "person", "people")}</strong></span>
                    <span className="muted">{statsEntry.lastClickedAt ? `Last click ${lowerFirst(formatWhen(statsEntry.lastClickedAt))}` : formatWhen(undefined)}</span>
                    {statsEntry.topCountries.length > 0 && (
                      <p className="muted activity-summary">
                        Top countries: {statsEntry.topCountries.map((entry) => `${countryName(entry.country)} (${entry.count.toLocaleString("en-IN")})`).join(", ")}
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
