"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AtSign,
  CheckCircle2,
  LayoutGrid,
  Link2,
  MessageCircle,
  MessageSquare,
  Plus,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { basicAutomationTemplates, triggerLabel, type PremadeTemplate, type TemplateTriggerType } from "@/src/lib/automation/templates";

const CATEGORY_ICONS: Record<TemplateTriggerType, typeof MessageCircle> = {
  comment: MessageSquare,
  message: MessageCircle,
  story_mention: AtSign,
  first_contact: UserPlus,
  referral: Link2,
  optin: CheckCircle2,
};

/** One concrete line per recipe so the tile shows the flow, not just the label. */
const TEMPLATE_EXAMPLES: Record<string, string> = {
  "comment-link-dm": "Comment “link” → DM: “Here you go: https://…”",
  "conversation-starters": "DM “hi” → menu: Pricing / Support / Catalog",
  "email-capture": "Comment “guide” → DM asking for email → deliver it",
  "welcome-new-followers": "First DM ever → “Hey! Thanks for reaching out.”",
  "story-mention-reply": "They mention you in a story → thank-you DM",
  "default-reply": "Anything unmatched → “Got it! Someone will reply soon.”",
  "main-menu": "“MENU” → tappable list of everything you offer",
  "comment-catch-all": "Any comment on any post → instant private reply",
  "referral-welcome": "Tap from an ad/ref link → warm welcome DM",
  "optin-confirmation": "Opt-in tap → “Done! Here is what you asked for.”",
  "giveaway-entry": "DM “enter” → “You are in. Here are the rules.”",
  "affiliate-link": "Comment your code word → affiliate link by DM",
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

  function go(href: string) {
    onClose();
    router.push(href);
  }

  const items: PickerItem[] = useMemo(() => {
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
    const recipes: PickerItem[] = basicAutomationTemplates.map((template: PremadeTemplate) => ({
      id: template.id,
      title: template.title,
      description: template.description,
      example: TEMPLATE_EXAMPLES[template.id],
      category: template.setup.definition.trigger.type,
      popular: template.popular,
      href: `/automations/new?type=classic&template=${template.id}`,
    }));
    return [campaign, ...recipes];
  }, []);

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
    <div className="modal-scrim" onMouseDown={onClose}>
      <div className="modal-panel is-wide template-picker" role="dialog" aria-modal="true" aria-labelledby={headingId} onMouseDown={(event) => event.stopPropagation()}>
        <header className="template-picker-head">
          <h2 id={headingId}>Templates</h2>
          <div className="template-picker-head-actions">
            <button type="button" className="button button-secondary button-small" onClick={() => go("/automations/new?type=classic")}>
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
            {visible.length === 0 && <p className="muted">No templates match “{query}”.</p>}

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
