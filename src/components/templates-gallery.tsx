"use client";

import Link from "next/link";
import { AtSign, CircleHelp, Menu, MessageCircle, Reply, UserPlus } from "lucide-react";
import { basicAutomationTemplates, type PremadeTemplate } from "@/src/lib/automation/templates";
import { AutomationSectionNav } from "./automation-section-nav";

const cardIcons = {
  "user-plus": UserPlus,
  message: MessageCircle,
  "at-sign": AtSign,
  reply: Reply,
  menu: Menu,
} as const;

/** Peach chat-bubble previews recreated with plain markup, one per template kind. */
function TemplateIllustration({ kind }: { kind: PremadeTemplate["illustration"] }) {
  if (kind === "follow") {
    return (
      <div className="template-illustration" aria-hidden="true">
        <span className="bubble bubble-follow-pill">follow</span>
        <span className="bubble">Hi there 👋 Thanks for following us!</span>
      </div>
    );
  }
  if (kind === "faq") {
    return (
      <div className="template-illustration" aria-hidden="true">
        <span className="bubble">What are your prices?</span>
        <span className="bubble">What are your working hours?</span>
        <span className="bubble">Do you provide delivery?</span>
      </div>
    );
  }
  if (kind === "story") {
    return (
      <div className="template-illustration" aria-hidden="true">
        <div className="story-tile">
          <span className="story-sticker">@yourbrand</span>
        </div>
        <span className="bubble">Thanks for mentioning us! 🧡</span>
        <span className="bubble">Take your gift</span>
      </div>
    );
  }
  if (kind === "default") {
    return (
      <div className="template-illustration" aria-hidden="true">
        <span className="bubble bubble-accent">I have a question 🙋</span>
        <span className="bubble">Talk to human</span>
        <span className="bubble">See our FAQs</span>
      </div>
    );
  }
  return (
    <div className="template-illustration" aria-hidden="true">
      <div className="menu-phone">
        <p className="menu-phone-title">More options</p>
        <p className="menu-phone-hint">Tap to send</p>
        <span className="menu-item"><span>Discounts 💰</span></span>
        <span className="menu-item"><span>Delivery 🛵</span></span>
        <span className="menu-item"><span>New in stock 📦</span></span>
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: PremadeTemplate }) {
  const Icon = cardIcons[template.icon];
  return (
    <article className="template-card">
      <div className="template-body">
        <div className="template-heading">
          <span className="template-icon"><Icon size={19} strokeWidth={1.8} /></span>
          <h2>
            {template.title}
            {template.badge && <em className="badge-beta">{template.badge}</em>}
          </h2>
        </div>
        <p className="muted">{template.description}</p>
        {template.available ? (
          <Link
            className="button button-setup"
            href={`/automations/new?type=classic&template=${template.id}`}
          >
            Set Up
          </Link>
        ) : (
          <p className="template-note">
            <CircleHelp size={15} />
            <span>
              Unavailable for now.{" "}
              <Link className="text-link" href="/support">Learn more</Link>
            </span>
          </p>
        )}
      </div>
      <TemplateIllustration kind={template.illustration} />
    </article>
  );
}

export function TemplatesGallery() {
  return (
    <div className="page-wrap narrow-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace / automation</p>
          <h1>Automation</h1>
          <p className="muted page-lede">
            Start from a premade recipe — set one up, tweak anything you want, and save it to your
            workspace.
          </p>
        </div>
      </header>
      <div className="section-layout">
        <AutomationSectionNav active="basic" />
        <div className="template-list">
          {basicAutomationTemplates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      </div>
    </div>
  );
}
