"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpen,
  CircleHelp,
  CreditCard,
  ExternalLink,

  LifeBuoy,
  Mail,
  Search,
  Sparkles,
  Workflow,
  Wrench,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { InstagramGlyph } from "./instagram-glyph";

type Topic = {
  id: string;
  title: string;
  blurb: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  articles: { q: string; a: React.ReactNode }[];
};

const TOPICS: Topic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blurb: "Set up the workspace, learn key ideas, and send your first automated reply.",
    icon: BookOpen,
    articles: [
      {
        q: "What is this app?",
        a: (
          <>
            A workspace for Instagram DM automation. Rules watch signals on your account —
            comments, story mentions, first-contact DMs — and reply with helpful messages in seconds.
          </>
        ),
      },
      {
        q: "What's the fastest way to get value out of it?",
        a: (
          <>
            Connect your Instagram account, then start from a ready-made recipe on the{" "}
            <Link href="/automations/templates">Templates</Link> page. Most recipes need only a keyword and a message.
          </>
        ),
      },
      {
        q: "What's an automation?",
        a: (
          <>
            An automation is a trigger plus actions: when someone comments a keyword or mentions your
            story, the flow replies privately, sends a link, or captures their email.
          </>
        ),
      },
    ],
  },
  {
    id: "connecting-instagram",
    title: "Connecting Instagram",
    blurb: "Link your professional account, required fields, and reconnecting when something breaks.",
    icon: InstagramGlyph,
    articles: [
      {
        q: "Which Instagram accounts work?",
        a: (
          <>
            Professional accounts (Business or Creator) linked to a Facebook Page. Personal accounts
            don’t expose the messaging APIs automations rely on.
          </>
        ),
      },
      {
        q: "Why do I see “Some fields need a reconnect”?",
        a: (
          <>
            Meta requires every listed field — comments, messages, quick-reply taps, opt-ins and
            referrals — to be subscribed. If one drops, open Settings and reconnect; the app re-subscribes everything for you.
          </>
        ),
      },
      {
        q: "How do I disconnect my account?",
        a: (
          <>
            Open My Profile and use Disconnect under the Instagram card, or manage it from{" "}
            <Link href="/settings">Settings</Link>. Disconnecting unsubscribes the webhooks remotely too.
          </>
        ),
      },
    ],
  },
];

const TOPICS_B: Topic[] = [
  {
    id: "automations",
    title: "Building automations",
    blurb: "Triggers, keywords, follow gates, and reviewing what a flow will send.",
    icon: Workflow,
    articles: [
      {
        q: "How do keywords work?",
        a: (
          <>
            A keyword trigger matches the exact word (case-insensitive) in a comment or DM.
            Use “any comment” or “any DM” to reply to everything instead.
          </>
        ),
      },
      {
        q: "What is a follow gate?",
        a: (
          <>
            A follow-gated campaign checks that the person follows you before delivering the goods.
            The opening DM asks them to follow and tap a button; only verified followers get the delivery message.
          </>
        ),
      },
      {
        q: "Can I test before going live?",
        a: (
          <>
            Yes — save the automation as a draft, then use the live preview in the builder and the
            Activity page to watch real executions before activating.
          </>
        ),
      },
    ],
  },
  {
    id: "sequences",
    title: "Sequences & broadcasts",
    blurb: "Multi-step DM journeys and one-off announcements to your contacts.",
    icon: Sparkles,
    articles: [
      {
        q: "When do sequence messages actually send?",
        a: (
          <>
            Steps are spaced by their delay, and everything pauses during your workspace quiet hours
            (Settings → Messaging quiet hours). Direct replies to a person’s own message are never delayed.
          </>
        ),
      },
      {
        q: "Who receives a broadcast?",
        a: (
          <>
            Choose “all known contacts” or only people who gave you an email through a capture flow.
            Broadcasts respect the same quiet hours.
          </>
        ),
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    blurb: "Nothing sent? Checklist for the usual suspects, from webhooks to quiet hours.",
    icon: Wrench,
    articles: [
      {
        q: "My automation didn't reply. What do I check first?",
        a: (
          <>
            In order: the automation is Active, the Instagram account is connected and shows all
            webhook fields subscribed (Settings), the keyword matched exactly, and the sender isn’t
            inside quiet hours. The Activity page shows each execution’s outcome.
          </>
        ),
      },
      {
        q: "The workspace says “Demo mode”.",
        a: (
          <>
            Demo mode runs on sample data until the server has a database and Meta credentials.
            Everything else works — you can build and preview, but nothing is sent to Instagram.
          </>
        ),
      },
      {
        q: "Someone stopped getting DMs after following.",
        a: (
          <>
            Instagram only allows one follow-gated delivery per person per campaign. If they
            uninstalled the app or revoked messages, ask them to comment the keyword again.
          </>
        ),
      },
    ],
  },
  {
    id: "account-billing",
    title: "Account & billing",
    blurb: "Plans, the free contacts limit, and managing your account.",
    icon: CreditCard,
    articles: [
      {
        q: "What does the free plan include?",
        a: (
          <>
            Every automation feature, up to 25 captured contacts, and one connected Instagram
            account. The sidebar meter shows how much of the limit you’ve used.
          </>
        ),
      },
      {
        q: "How do I change my password?",
        a: (
          <>
            My Profile → Password & devices. Updating your password keeps your other devices signed in;
            “Sign out of all devices” revokes every session instead.
          </>
        ),
      },
    ],
  },
];

const ALL_TOPICS = [...TOPICS, ...TOPICS_B];

function topicMetadataMatchesQuery(topic: Topic, query: string): boolean {
  if (!query) return true;
  const haystack = [topic.title, topic.blurb].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function HelpScreen({ supportEmail }: { supportEmail: string }) {
  const [query, setQuery] = useState("");
  const [openArticle, setOpenArticle] = useState<string | null>(null);

  const visibleTopics = useMemo(
    () => ALL_TOPICS
      .map((topic) => ({
        ...topic,
        articles: topic.articles.filter((article) =>
          !query || topicMetadataMatchesQuery(topic, query) || article.q.toLowerCase().includes(query.toLowerCase())
        ),
      }))
      .filter((topic) => topic.articles.length > 0),
    [query],
  );

  const totalArticles = ALL_TOPICS.reduce((sum, topic) => sum + topic.articles.length, 0);

  return (
    <AppShell>
      <div className="page-wrap narrow-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Support</p>
            <h1>Help</h1>
            <p className="muted page-lede">Guides and answers for every part of the workspace — searchable in one place.</p>
          </div>
        </header>

        <section className="help-hero" aria-label="Search help articles">
          <p className="help-kicker">Help centre</p>
          <h1>How can we help?</h1>
          <p className="help-lede">
            Browse {totalArticles} short guides across {ALL_TOPICS.length} topics. Everything is written for
            creators, not engineers.
          </p>
          <form
            className="help-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search guides — e.g. keywords, reconnect, quiet hours…"
              aria-label="Search help articles"
            />
            <button type="submit" aria-label="Run search">
              <Search size={17} />
            </button>
          </form>
        </section>

        <div className="help-grid" data-stagger>
          {visibleTopics.map(({ id, title, blurb, icon: Icon, articles }) => (
            <button
              className="help-topic-card"
              key={id}
              type="button"
              onClick={() => {
                setQuery("");
                setOpenArticle(`${id}:0`);
                requestAnimationFrame(() => {
                  document.getElementById(`topic-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
            >
              <span className="help-icon"><Icon size={18} strokeWidth={1.9} /></span>
              <h2>{title}</h2>
              <p>{blurb}</p>
              <span className="text-link">{articles.length} guide{articles.length === 1 ? "" : "s"}</span>
            </button>
          ))}
          {visibleTopics.length === 0 && (
            <div className="faq-empty">
              No guides match “{query}”. Try a different word, or email us below.
            </div>
          )}
        </div>

        <div className="faq-list" data-stagger>
          {visibleTopics.map(({ id, title, articles }) => (
            <section key={id} id={`topic-${id}`} aria-label={title} style={{ display: "contents" }}>
              <p className="sidebar-label">{title}</p>
              {articles.map((article, index) => {
                const key = `${id}:${index}`;
                const open = openArticle === key;
                return (
                  <div className={`faq-item ${open ? "is-open" : ""}`} key={key}>
                    <button
                      className="faq-question"
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenArticle(open ? null : key)}
                    >
                      {article.q}
                      <CircleHelp className="faq-chevron" size={16} />
                    </button>
                    {open && (
                      <div className="faq-answer">
                        {article.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>

        <div className="help-side">
          <section className="panel help-contact-card" aria-label="Contact support">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Still stuck?</p>
                <h2>Talk to a human</h2>
              </div>
              <LifeBuoy size={21} />
            </div>
            <p className="muted">
              Email us with your workspace name, the automation name, and roughly when it happened.
              Never include passwords or access tokens.
            </p>
            <a className="button button-primary" href={`mailto:${supportEmail}`}>
              <Mail size={16} /> {supportEmail}
            </a>
          </section>

          <section className="panel" aria-label="Policies">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Fine print</p>
                <h2>Policies & data</h2>
              </div>
              <BadgeCheck size={21} />
            </div>
            <ul className="kv-list">
              <li><span className="kv-label">Privacy policy</span><Link className="text-link" href="/privacy">View <ExternalLink size={12} /></Link></li>
              <li><span className="kv-label">Terms of service</span><Link className="text-link" href="/terms">View <ExternalLink size={12} /></Link></li>
              <li><span className="kv-label">Data deletion</span><Link className="text-link" href="/data-deletion">Request removal <ExternalLink size={12} /></Link></li>
              <li><span className="kv-label">Public support page</span><Link className="text-link" href="/support">Open <ExternalLink size={12} /></Link></li>
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
