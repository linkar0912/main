"use client";

import Link from "next/link";
import { AtSign, Mail, Menu, MessageCircle, Reply, UserPlus } from "lucide-react";
import { basicAutomationTemplates, type PremadeTemplate } from "@/src/lib/automation/templates";
import { AutomationSectionNav } from "./automation-section-nav";

const cardIcons = {
  "user-plus": UserPlus,
  message: MessageCircle,
  "at-sign": AtSign,
  reply: Reply,
  menu: Menu,
  mail: Mail,
} as const;

/** Dark chat-bubble mockups with a pinned caption bar, one per template kind. */
function TemplateIllustration({ kind }: { kind: PremadeTemplate["illustration"] }) {
  if (kind === "follow") {
    return (
      <div className="template-illustration" aria-hidden="true">
        <span className="bubble bubble-follow-pill">follow</span>
        <span className="bubble">Hi there 👋 Thanks for following us!</span>
        <span className="mockup-caption">Auto-DM · new follower</span>
      </div>
    );
  }
  if (kind === "faq") {
    return (
      <div className="template-illustration" aria-hidden="true">
        <span className="bubble">What are your prices?</span>
        <span className="bubble">What are your working hours?</span>
        <span className="bubble">Do you provide delivery?</span>
        <span className="mockup-caption">Auto-reply · keyword match</span>
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
        <span className="mockup-caption">Auto-DM · story mention</span>
      </div>
    );
  }
  if (kind === "email") {
    return (
      <div className="template-illustration" aria-hidden="true">
        <span className="bubble bubble-accent">Send me the guide 📬</span>
        <span className="bubble bubble-email-pill"><Mail size={13} strokeWidth={2} /> you@example.com</span>
        <span className="bubble">You’re in! ✅ Check your inbox.</span>
        <span className="mockup-caption">Email capture · DM flow</span>
      </div>
    );
  }
  if (kind === "default") {
    return (
      <div className="template-illustration" aria-hidden="true">
        <span className="bubble bubble-accent">I have a question 🙋</span>
        <span className="bubble">Talk to human</span>
        <span className="bubble">See our FAQs</span>
        <span className="mockup-caption">Auto-reply · comment</span>
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
      <span className="mockup-caption">Quick-reply menu</span>
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
          <h2>{template.title}</h2>
        </div>
        <p className="muted">{template.description}</p>
        <Link
          className="button button-setup"
          href={`/automations/new?type=classic&template=${template.id}`}
        >
          Set Up
        </Link>
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
