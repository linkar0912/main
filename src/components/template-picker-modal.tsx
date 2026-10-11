"use client";

import { presenceProps, usePresenceState } from "@/src/components/ui/use-presence";
import { slidingThumbRef } from "@/src/components/ui/use-sliding-thumb";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AtSign,
  CheckCircle2,
  ChevronDown,
  LayoutGrid,
  Link2,
  MessageCircle,
  MessageSquare,
  Plus,
  Reply,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { FacebookGlyph } from "./facebook-glyph";
import { useFocusTrap } from "./use-focus-trap";
import { InstagramGlyph } from "./instagram-glyph";
import { basicAutomationTemplates, getCompatibleTemplates, triggerLabel, type PremadeTemplate, type TemplateTriggerType } from "@/src/lib/automation/templates";

type Provider = "INSTAGRAM" | "FACEBOOK";

const CATEGORY_ICONS: Record<TemplateTriggerType, typeof MessageCircle> = {
  comment: MessageSquare,
  message: MessageCircle,
  story_mention: AtSign,
  story_reply: Reply,
  first_contact: UserPlus,
  referral: Link2,
  optin: CheckCircle2,
};

// Order categories the way a person thinks about them, not alphabetically.
const CATEGORY_ORDER: TemplateTriggerType[] = ["comment", "message", "story_reply", "story_mention", "first_contact", "referral", "optin"];

// Short names for the category list, so no label ever wraps. The full name
// (triggerLabel) still heads the results and labels each card.
const CATEGORY_SHORT_LABELS: Record<TemplateTriggerType, string> = {
  comment: "Comments",
  message: "Messages",
  story_reply: "Story replies",
  story_mention: "Story mentions",
  first_contact: "First message",
  referral: "From ads",
  optin: "Button taps",
};

// Cards stay compact: the first three steps tell the story.
const MAX_STEPS = 3;

type PickerItem = {
  id: string;
  title: string;
  description: string;
  howItWorks: string[];
  category: TemplateTriggerType;
  popular?: boolean;
  featured?: boolean;
  href: string;
};

/** Facebook Pages have posts, not Reels, so their comment category says so. */
function categoryLabel(type: TemplateTriggerType, provider: Provider): string {
  return provider === "FACEBOOK" && type === "comment" ? "Page comments" : triggerLabel(type);
}

function shortCategoryLabel(type: TemplateTriggerType, provider: Provider): string {
  return provider === "FACEBOOK" && type === "comment" ? "Page comments" : CATEGORY_SHORT_LABELS[type];
}

function matchesQuery(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

function Tile({ item, provider, onSelect }: { item: PickerItem; provider: Provider; onSelect: () => void }) {
  const steps = item.howItWorks.slice(0, MAX_STEPS);
  return (
    <button type="button" className="template-picker-tile" onClick={onSelect}>
      <span className="template-picker-tile-body">
        <strong className="template-picker-tile-title">{item.title}</strong>
        <span className="template-picker-tile-description">{item.description}</span>
      </span>
      {steps.length > 0 && (
        <span className="template-picker-steps">
          <small>How it works</small>
          <ol>
            {steps.map((step, index) => (
              <li key={step}>
                <span className="template-picker-step-number" aria-hidden="true">{index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </span>
      )}
      <span className="template-picker-tile-foot">
        <span>{item.featured ? "Quick automation" : categoryLabel(item.category, provider)}</span>
        {item.popular && <span className="template-picker-badge">Popular</span>}
      </span>
    </button>
  );
}

/**
 * The single entry point for starting a new automation - templates, the
 * follow-gated campaign quick-start, and a blank builder, all in one place.
 * Replaces the old separate /automations/templates page and /automations/new
 * type chooser: nothing to browse to, just pick and go.
 */
export function TemplatePickerModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<TemplateTriggerType | null>(null);
  const [provider, setProvider] = useState<Provider>("INSTAGRAM");
  const [facebookPages, setFacebookPages] = useState<{ pageId: string; pageName: string; status: string }[]>([]);
  const [facebookPagesState, setFacebookPagesState] = useState<"loading" | "ready" | "error">("loading");
  const [facebookPagesAttempt, setFacebookPagesAttempt] = useState(0);
  const [facebookPageId, setFacebookPageId] = useState("");
  const headingId = useId();
  const helperId = useId();
  const presence = usePresenceState();
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, { onEscape: onClose, initialFocusRef: searchRef });

  useEffect(() => {
    if (provider !== "FACEBOOK") return;
    let active = true;
    fetch("/api/facebook/connection")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: { pageId: string; pageName: string; status: string }[] };
        if (!active) return;
        if (!response.ok) throw new Error("Could not load your Facebook Pages");
        const connected = (payload.data ?? []).filter((page) => page.status === "CONNECTED");
        setFacebookPages(connected);
        // One connected Page is the only possible answer - pick it.
        if (connected.length === 1) setFacebookPageId((current) => current || connected[0].pageId);
        setFacebookPagesState("ready");
      })
      .catch(() => {
        if (!active) return;
        setFacebookPages([]);
        setFacebookPagesState("error");
      });
    return () => { active = false; };
  }, [provider, facebookPagesAttempt]);

  // A new channel or category starts the results at the top.
  useEffect(() => {
    resultsRef.current?.scrollTo?.({ top: 0 });
  }, [provider, category]);

  const noFacebookPage = provider === "FACEBOOK" && facebookPagesState === "ready" && facebookPages.length === 0;
  const showPageSelect = provider === "FACEBOOK" && (facebookPagesState === "loading" || (facebookPagesState === "ready" && facebookPages.length > 0));

  function go(href: string) {
    onClose();
    router.push(href);
  }

  function chooseProvider(next: Provider) {
    if (next === "FACEBOOK" && provider !== "FACEBOOK") setFacebookPagesState("loading");
    setProvider(next);
    setCategory(null);
  }

  const blankBuilderHref = provider === "FACEBOOK"
    ? `/automations/new?type=classic&provider=facebook&surface=comment&connection=${encodeURIComponent(facebookPageId)}`
    : "/automations/new?type=classic";

  const items: PickerItem[] = useMemo(() => {
    if (provider === "FACEBOOK" && !facebookPageId) return [];
    const campaign: PickerItem = {
      id: "campaign-follow-gate",
      title: "Send a link after someone follows you",
      description: "Ask people to follow you before Linkar sends the link they requested.",
      howItWorks: [
        "Someone comments using a word you choose.",
        "Linkar replies and asks permission to send a message.",
        "After they follow you, Linkar sends your link.",
      ],
      category: "comment",
      popular: true,
      featured: true,
      href: "/automations/new?type=campaign",
    };
    const compatible = provider === "FACEBOOK"
      ? getCompatibleTemplates({ provider: "FACEBOOK", surface: "COMMENT", capabilities: ["facebook-page-comment"] })
      : basicAutomationTemplates.filter((template) => template.provider === "INSTAGRAM");
    const recipes: PickerItem[] = compatible.map((template: PremadeTemplate) => ({
      id: template.id,
      title: template.title,
      description: template.description,
      howItWorks: template.howItWorks,
      category: template.setup.definition.trigger.type,
      popular: template.popular,
      href: provider === "FACEBOOK"
        ? `/automations/new?type=classic&template=${template.id}&provider=facebook&surface=comment&connection=${encodeURIComponent(facebookPageId)}`
        : `/automations/new?type=classic&template=${template.id}`,
    }));
    return provider === "INSTAGRAM" ? [campaign, ...recipes] : recipes;
  }, [facebookPageId, provider]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<TemplateTriggerType, number>();
    for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return counts;
  }, [items]);

  const matching = items.filter((item) => {
    if (category && item.category !== category) return false;
    if (!query.trim()) return true;
    return matchesQuery(item.title, query) || matchesQuery(item.description, query);
  });
  // Popular templates lead (each carries a "Popular" chip); the rest keep their order.
  const visible = [...matching.filter((item) => item.popular), ...matching.filter((item) => !item.popular)];

  const resultsTitle = category ? categoryLabel(category, provider) : "All templates";
  const surfaceHint = provider === "FACEBOOK" ? "Works with comments on your Facebook Page" : "Works with comments and messages on Instagram";

  function emptyState() {
    if (provider === "FACEBOOK" && !facebookPageId) {
      if (facebookPagesState === "loading") return <p className="template-picker-empty-title">Loading your Facebook Pages…</p>;
      if (facebookPagesState === "error") {
        return (
          <div role="alert">
            <p className="template-picker-empty-title">Your Facebook Pages could not load.</p>
            <p>Check your connection, then try again.</p>
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => {
                setFacebookPagesState("loading");
                setFacebookPagesAttempt((attempt) => attempt + 1);
              }}
            >
              Try again
            </button>
          </div>
        );
      }
      if (noFacebookPage) {
        return (
          <>
            <p className="template-picker-empty-title">No Page connected yet</p>
            <p>Connect a Facebook Page to reply to comments on its posts.</p>
            <Link className="button button-secondary button-small" href="/settings" onClick={onClose}>Connect one in Settings</Link>
          </>
        );
      }
      return <p className="template-picker-empty-title">Choose your Facebook Page above to see its templates.</p>;
    }
    return (
      <>
        <p className="template-picker-empty-title">No templates match “{query.trim()}”.</p>
        <p>Try a shorter word, or start from scratch.</p>
        <button
          type="button"
          className="button button-secondary button-small"
          onClick={() => {
            setQuery("");
            setCategory(null);
            searchRef.current?.focus();
          }}
        >
          Clear search
        </button>
      </>
    );
  }

  return createPortal(
    <div className="modal-scrim template-picker-scrim" onMouseDown={onClose} {...presenceProps(presence)}>
      <div
        ref={panelRef}
        tabIndex={-1}
        className="modal-panel template-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={helperId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="template-picker-head">
          <div className="template-picker-heading">
            <h2 id={headingId}>Choose a template</h2>
            <p id={helperId}>Pick a starting point. You can change every word in the builder.</p>
          </div>
          <div className="template-picker-head-actions">
            <button
              type="button"
              className="button button-secondary template-picker-scratch"
              disabled={provider === "FACEBOOK" && !facebookPageId}
              onClick={() => go(blankBuilderHref)}
            >
              <Plus size={16} aria-hidden="true" /> Start from scratch
            </button>
            <button type="button" className="icon-button template-picker-close" aria-label="Close" onClick={onClose}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="template-picker-toolbar" data-provider={provider.toLowerCase()}>
          <label className="template-picker-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates…"
              aria-label="Search templates"
              autoComplete="off"
              enterKeyHint="search"
            />
          </label>

          <div ref={slidingThumbRef} className="segmented template-channel-switch" role="group" aria-label="Automation channel">
            <button
              type="button"
              className={`segmented-option template-channel-option ${provider === "INSTAGRAM" ? "is-active" : ""}`}
              aria-label="Instagram"
              aria-pressed={provider === "INSTAGRAM"}
              onClick={() => chooseProvider("INSTAGRAM")}
            >
              <span className="template-channel-brand-mark"><InstagramGlyph size={16} brand /></span>
              <span>Instagram</span>
            </button>
            <button
              type="button"
              className={`segmented-option template-channel-option ${provider === "FACEBOOK" ? "is-active" : ""}`}
              aria-label="Facebook"
              aria-pressed={provider === "FACEBOOK"}
              onClick={() => chooseProvider("FACEBOOK")}
            >
              <span className="template-channel-brand-mark"><FacebookGlyph size={16} brand /></span>
              <span>Facebook</span>
            </button>
          </div>

          {showPageSelect && (
            <span className="template-channel-select-shell">
              <FacebookGlyph size={16} />
              <select
                aria-label="Facebook Page"
                value={facebookPageId}
                disabled={facebookPagesState === "loading"}
                aria-busy={facebookPagesState === "loading"}
                onChange={(event) => setFacebookPageId(event.target.value)}
              >
                <option value="">{facebookPagesState === "loading" ? "Loading your Pages…" : "Select a connected Page"}</option>
                {facebookPages.map((page) => <option key={page.pageId} value={page.pageId}>{page.pageName}</option>)}
              </select>
              <ChevronDown className="template-channel-select-chevron" size={16} aria-hidden="true" />
            </span>
          )}
        </div>

        <div className="template-picker-layout">
          {/* Selection is the white tile from docs/brand.md "Selection", drawn
              by this block's own rules (Round 6: templates) until the shared
              vertical-nav tile classes land; the markup already follows the
              shared container > item + slidingThumbRef pattern. */}
          <nav ref={slidingThumbRef} className="template-picker-categories" aria-label="Template categories">
            <button
              type="button"
              className={`template-picker-category ${category === null ? "is-active" : ""}`}
              aria-pressed={category === null}
              onClick={() => setCategory(null)}
            >
              <LayoutGrid size={16} strokeWidth={1.8} aria-hidden="true" />
              <span className="template-picker-category-label">All templates</span>
              {items.length > 0 ? <span className="template-picker-count">{items.length}</span> : null}
            </button>
            {CATEGORY_ORDER.filter((type) => categoryCounts.has(type)).map((type) => {
              const Icon = CATEGORY_ICONS[type];
              return (
                <button
                  key={type}
                  type="button"
                  className={`template-picker-category ${category === type ? "is-active" : ""}`}
                  aria-pressed={category === type}
                  title={categoryLabel(type, provider)}
                  onClick={() => setCategory(type)}
                >
                  <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                  <span className="template-picker-category-label">{shortCategoryLabel(type, provider)}</span>
                  <span className="template-picker-count">{categoryCounts.get(type)}</span>
                </button>
              );
            })}
          </nav>

          <section className="template-picker-results" aria-labelledby={`${headingId}-results`}>
            <div className="template-picker-results-head">
              <h3 id={`${headingId}-results`}>{resultsTitle}</h3>
              <p>{surfaceHint}</p>
            </div>
            <div ref={resultsRef} className="template-picker-content" role="region" aria-label="Template results" tabIndex={0}>
              {visible.length === 0 ? (
                <div className="template-picker-empty">{emptyState()}</div>
              ) : (
                <div className="template-picker-grid">
                  {visible.map((item) => <Tile key={item.id} item={item} provider={provider} onSelect={() => go(item.href)} />)}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
