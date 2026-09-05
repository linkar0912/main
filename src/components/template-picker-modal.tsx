"use client";

import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AtSign,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Link2,
  MessageCircle,
  MessageSquare,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { FacebookGlyph } from "./facebook-glyph";
import { InstagramGlyph } from "./instagram-glyph";
import { basicAutomationTemplates, getCompatibleTemplates, triggerLabel, type PremadeTemplate, type TemplateTriggerType } from "@/src/lib/automation/templates";

const CATEGORY_ICONS: Record<TemplateTriggerType, typeof MessageCircle> = {
  comment: MessageSquare,
  message: MessageCircle,
  story_mention: AtSign,
  first_contact: UserPlus,
  referral: Link2,
  optin: CheckCircle2,
};

/**
 * One concrete line per recipe so the tile shows the flow, not just the label.
 * The opening word has to match the recipe's real trigger - a line that promises
 * "Comment X →" on a DM-triggered recipe describes a flow the builder will not
 * let you build. `template-picker-modal.test.tsx` enforces that.
 */
export const TEMPLATE_EXAMPLES: Record<string, string> = {
  "comment-link-dm": "Comment “link” → DM: “Here you go: https://…”",
  "conversation-starters": "DM “price” → menu: Pricing / Hours / Delivery",
  "email-capture": "DM “guide” → asks for their email → delivers it",
  "welcome-new-followers": "First DM ever → “Hey! Thanks for reaching out.”",
  "story-mention-reply": "They mention you in a story → thank-you DM",
  "default-reply": "Anything unmatched → “Got it! Someone will reply soon.”",
  "main-menu": "“MENU” → tappable list of everything you offer",
  "comment-catch-all": "Comment anything (no keyword) → instant private reply",
  "referral-welcome": "Tap from an ad/ref link → warm welcome DM",
  "optin-confirmation": "Opt-in tap → “Done! Here is what you asked for.”",
  "giveaway-entry": "DM “enter” → “You are in. Here are the rules.”",
  "affiliate-link": "DM “shop” → affiliate link with a tappable button",
  "lead-magnet-comment": "Comment “GUIDE” → private reply with your free PDF link",
  "price-list-responder": "DM “price” → product photo + prices → catalog button",
  "course-faq-booking": "DM “course” → program details → book-a-call button",
  "event-registration": "DM “webinar” → collects name, email, phone → confirms seat",
  "influencer-collab-intake": "DM “collab” → collects email, niche, platform → alerts team",
  "giveaway-comment-entry": "Comment “ENTER” → private reply: “You’re in!”",
  "offer-followup": "DM “offer” → deal link → next day: “Still interested?”",
  "facebook-keyword-comment-reply": "Comment “price” → public Page reply",
  "facebook-every-comment-reply": "Any top-level comment → public Page reply",
  "facebook-product-pricing-faq": "Comment “price” → public pricing acknowledgement",
  "facebook-availability-hours": "Comment “hours” → public availability acknowledgement",
  "facebook-giveaway-acknowledgement": "Comment “enter” → public giveaway acknowledgement",
  "facebook-support-acknowledgement": "Comment “help” → public support acknowledgement",
  "facebook-per-post-campaign-reply": "Campaign comment → public reply on selected posts",
};

const CAMPAIGN_EXAMPLE = "Comment “drop” → public reply → DM opt-in → follow check → link";

// Order categories the way a person thinks about them, not alphabetically.
const CATEGORY_ORDER: TemplateTriggerType[] = ["comment", "message", "story_mention", "first_contact", "referral", "optin"];

type PickerItem = {
  id: string;
  title: string;
  description: string;
  example?: string;
  category: TemplateTriggerType;
  popular?: boolean;
  featured?: boolean;
  href: string;
};

function matchesQuery(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

function Tile({ item, onSelect }: { item: PickerItem; onSelect: () => void }) {
  return (
    <button type="button" className="template-picker-tile" onClick={onSelect}>
      <strong>{item.title}</strong>
      <p>{item.description}</p>
      {item.example && <span className="template-example">{item.example}</span>}
      <span className="template-picker-tile-meta">
        <span>{item.featured ? "Quick automation" : triggerLabel(item.category)}</span>
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
  const [provider, setProvider] = useState<"INSTAGRAM" | "FACEBOOK">("INSTAGRAM");
  const [facebookPages, setFacebookPages] = useState<{ pageId: string; pageName: string; status: string }[]>([]);
  const [facebookPageId, setFacebookPageId] = useState("");
  const headingId = useId();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (provider !== "FACEBOOK") return;
    let active = true;
    fetch("/api/facebook/connection")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: { pageId: string; pageName: string; status: string }[] };
        if (active && response.ok) setFacebookPages((payload.data ?? []).filter((page) => page.status === "CONNECTED"));
      })
      .catch(() => {
        if (active) setFacebookPages([]);
      });
    return () => { active = false; };
  }, [provider]);

  function go(href: string) {
    onClose();
    router.push(href);
  }

  const blankBuilderHref = provider === "FACEBOOK"
    ? `/automations/new?type=classic&provider=facebook&surface=comment&connection=${encodeURIComponent(facebookPageId)}`
    : "/automations/new?type=classic";

  const items: PickerItem[] = useMemo(() => {
    if (provider === "FACEBOOK" && !facebookPageId) return [];
    const campaign: PickerItem = {
      id: "campaign-follow-gate",
      title: "Follow-gated Reel campaign",
      description: "Comment keyword → public reply → DM opt-in → follow check → deliver your link.",
      example: CAMPAIGN_EXAMPLE,
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
      example: TEMPLATE_EXAMPLES[template.id],
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

  const visible = items.filter((item) => {
    if (category && item.category !== category) return false;
    if (!query.trim()) return true;
    return matchesQuery(item.title, query) || matchesQuery(item.description, query);
  });
  const popular = visible.filter((item) => item.popular);
  const rest = visible.filter((item) => !item.popular);

  return createPortal(
    <div className="modal-scrim template-picker-scrim" onMouseDown={onClose}>
      <div className="modal-panel is-wide template-picker" role="dialog" aria-modal="true" aria-labelledby={headingId} onMouseDown={(event) => event.stopPropagation()}>
        <header className="template-picker-head">
          <h2 id={headingId}>Templates</h2>
          <div className="template-picker-head-actions">
            <button type="button" className="button button-secondary button-small" disabled={provider === "FACEBOOK" && !facebookPageId} onClick={() => go(blankBuilderHref)}>
              <Plus size={14} /> Start from scratch
            </button>
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="template-picker-search">
          <Search size={16} />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates…"
            aria-label="Search templates"
          />
        </div>

        <div
          className="template-channel-runway"
          data-provider={provider.toLowerCase()}
          style={provider === "FACEBOOK" ? {
            "--channel-color": "#1877F2",
            "--channel-rail": "linear-gradient(90deg, #1877F2, #65A4F7)",
          } as CSSProperties : undefined}
          aria-label="Automation channel"
        >
          <div className="template-channel-choice">
            <span className="template-channel-context-label">Build for</span>
            <div className="template-channel-switch" role="group" aria-label="Choose a channel">
              <button
                type="button"
                className={`template-channel-option is-instagram ${provider === "INSTAGRAM" ? "is-active" : ""}`}
                aria-label="Instagram"
                aria-pressed={provider === "INSTAGRAM"}
                onClick={() => { setProvider("INSTAGRAM"); setCategory(null); }}
              >
                <span className="template-channel-brand-mark"><InstagramGlyph size={19} brand /></span>
                <span>Instagram</span>
              </button>
              <button
                type="button"
                className={`template-channel-option is-facebook ${provider === "FACEBOOK" ? "is-active" : ""}`}
                aria-label="Facebook"
                aria-pressed={provider === "FACEBOOK"}
                onClick={() => { setProvider("FACEBOOK"); setCategory(null); }}
              >
                <span className="template-channel-brand-mark"><FacebookGlyph size={19} brand /></span>
                <span>Facebook</span>
              </button>
            </div>
          </div>

          <span className="template-channel-flow" aria-hidden="true"><span /><ChevronRight size={14} /></span>

          {provider === "FACEBOOK" && (
            <label className="template-channel-destination">
              <span className="template-channel-context-label">Connected Page</span>
              <span className="template-channel-select-shell">
                <FacebookGlyph size={16} />
                <select aria-label="Facebook Page" value={facebookPageId} onChange={(event) => setFacebookPageId(event.target.value)}>
                  <option value="">Select a connected Page</option>
                  {facebookPages.map((page) => <option key={page.pageId} value={page.pageId}>{page.pageName}</option>)}
                </select>
                <ChevronDown className="template-channel-select-chevron" size={16} aria-hidden="true" />
              </span>
            </label>
          )}

          {provider === "FACEBOOK" && <span className="template-channel-flow" aria-hidden="true"><span /><ChevronRight size={14} /></span>}

          <div className="template-channel-surface">
            <span>
              <small>Automation surface</small>
              <strong>{provider === "FACEBOOK" ? "Page comments" : "Comments & messages"}</strong>
            </span>
          </div>
        </div>

        <div className="template-picker-layout">
          <nav className="template-picker-categories" aria-label="Template categories">
            <button type="button" className={`template-picker-category ${category === null ? "is-active" : ""}`} onClick={() => setCategory(null)}>
              <LayoutGrid size={16} strokeWidth={1.8} />
              <span>All templates</span>
              <span className="template-picker-count">{items.length}</span>
            </button>
            {CATEGORY_ORDER.filter((type) => categoryCounts.has(type)).map((type) => {
              const Icon = CATEGORY_ICONS[type];
              return (
                <button key={type} type="button" className={`template-picker-category ${category === type ? "is-active" : ""}`} onClick={() => setCategory(type)}>
                  <Icon size={16} strokeWidth={1.8} />
                  <span>{triggerLabel(type)}</span>
                  <span className="template-picker-count">{categoryCounts.get(type)}</span>
                </button>
              );
            })}
          </nav>

          <div className="template-picker-content">
            {visible.length === 0 && (
              <p className="muted">
                {provider === "FACEBOOK" && !facebookPageId ? "Select a connected Facebook Page to choose a recipe." : `No templates match “${query}”.`}
              </p>
            )}

            {popular.length > 0 && (
              <>
                <p className="template-picker-section-label">Recommended</p>
                <div className="template-picker-grid">
                  {popular.map((item) => <Tile key={item.id} item={item} onSelect={() => go(item.href)} />)}
                </div>
              </>
            )}

            {rest.length > 0 && (
              <>
                <p className="template-picker-section-label">More templates</p>
                <div className="template-picker-grid">
                  {rest.map((item) => <Tile key={item.id} item={item} onSelect={() => go(item.href)} />)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
