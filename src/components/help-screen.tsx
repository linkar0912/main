"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookOpen,
  CircleHelp,
  CreditCard,
  ExternalLink,
  LayoutGrid,
  LifeBuoy,
  Mail,
  Search,
  Sparkles,
  Workflow,
  Wrench,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { FacebookGlyph } from "./facebook-glyph";
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
            A workspace for Instagram conversations and Facebook Page comment automation. Rules watch
            supported signals and send the reply you configured.
          </>
        ),
      },
      {
        q: "What's the fastest way to get value out of it?",
        a: (
          <>
            Connect Instagram or a Facebook Page, then start from a ready-made recipe on the{" "}
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
    id: "connecting-facebook",
    title: "Connecting Facebook Pages",
    blurb: "Connect a Page, choose the right Page, and keep public comment subscriptions healthy.",
    icon: FacebookGlyph,
    articles: [
      {
        q: "What can Facebook automations reply to?",
        a: (
          <>
            Facebook Page automations send public replies to top-level comments on Page posts.
            Page-authored comments and nested replies are ignored to prevent loops. Facebook does not use Instagram private-reply or DM actions.
          </>
        ),
      },
      {
        q: "Which Facebook permissions are required?",
        a: (
          <>
            The Page connection requests pages_show_list, pages_manage_metadata,
            pages_manage_engagement, pages_read_engagement, and pages_read_user_content.
            The person connecting must be allowed to manage the selected Page.
          </>
        ),
      },
      {
        q: "Why does Facebook webhook health show missing fields?",
        a: (
          <>
            Open Settings and reconnect the Page. Linkar checks the current feed subscription without
            changing it, then reconnecting refreshes the Page subscription when needed.
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
            Meta requires every listed field - comments, messages, quick-reply taps, opt-ins and
            referrals - to be subscribed. If one drops, open Settings and reconnect; the app re-subscribes everything for you.
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
            Yes - save the automation as a draft, then use the live preview in the builder and the
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
            Everything else works - you can build and preview, but nothing is sent to Instagram.
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
            Every automation feature, up to 25 captured contacts, and one connected social
            channel. The sidebar meter shows how much of the limit you’ve used.
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

function topicMetadataMatchesQuery(topic: Topic, query: string): boolean {
  const haystack = [topic.title, topic.blurb].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function HelpScreen({ supportEmail }: { supportEmail: string }) {
  const [query, setQuery] = useState("");
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [openArticle, setOpenArticle] = useState<string | null>(null);

  function selectTopic(id: string | null) {
    setActiveTopicId(id);
    setQuery("");
    setOpenArticle(null);
  }

  const searching = query.trim().length > 0;

  const visibleTopics = useMemo(() => {
    if (searching) {
      return TOPICS
        .map((topic) => ({
          ...topic,
          articles: topic.articles.filter((article) =>
            topicMetadataMatchesQuery(topic, query) || article.q.toLowerCase().includes(query.toLowerCase())
          ),
        }))
        .filter((topic) => topic.articles.length > 0);
    }
    if (activeTopicId) return TOPICS.filter((topic) => topic.id === activeTopicId);
    return TOPICS;
  }, [query, searching, activeTopicId]);

  const showGroupLabels = searching || activeTopicId === null;
  const activeTopic = TOPICS.find((topic) => topic.id === activeTopicId) ?? null;
  const totalArticles = TOPICS.reduce((sum, topic) => sum + topic.articles.length, 0);

  return (
    <AppShell>
      <div className="page-wrap narrow-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Support</p>
            <h1>Help</h1>
            <p className="muted page-lede">Guides and answers for every part of the workspace - searchable in one place.</p>
          </div>
        </header>

        <section className="help-hero grid-texture" aria-label="Search help articles">
          <p className="help-kicker">Help centre</p>
          <h1>How can we help?</h1>
          <p className="help-lede">
            Browse {totalArticles} short guides across {TOPICS.length} topics. Everything is written for
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
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveTopicId(null);
              }}
              placeholder="Search guides - e.g. keywords, reconnect, quiet hours…"
              aria-label="Search help articles"
            />
            <button type="submit" aria-label="Run search">
              <Search size={17} />
            </button>
          </form>
        </section>

        <div className="section-layout">
          <nav className="section-nav" aria-label="Help topics">
            <button
              type="button"
              className={`section-nav-link ${!searching && activeTopicId === null ? "is-active" : ""}`}
              onClick={() => selectTopic(null)}
            >
              <LayoutGrid size={18} strokeWidth={1.8} />
              <span>All topics</span>
              <span className="section-nav-count">{totalArticles}</span>
            </button>
            {TOPICS.map(({ id, title, icon: Icon, articles }) => (
              <button
                key={id}
                type="button"
                className={`section-nav-link ${!searching && activeTopicId === id ? "is-active" : ""}`}
                onClick={() => selectTopic(id)}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{title}</span>
                <span className="section-nav-count">{articles.length}</span>
              </button>
            ))}
          </nav>

          <div className="section-content">
            <div className="help-content-head">
              <h2>{searching ? `Results for “${query}”` : activeTopic ? activeTopic.title : "All topics"}</h2>
              {!searching && activeTopic && <p className="muted">{activeTopic.blurb}</p>}
            </div>

            {visibleTopics.length === 0 ? (
              <p className="faq-empty">No guides match “{query}”. Try a different word, or email us below.</p>
            ) : (
              <div className="faq-list">
                {visibleTopics.map((topic) => (
                  <div key={topic.id} style={{ display: "contents" }}>
                    {showGroupLabels && <p className="sidebar-label">{topic.title}</p>}
                    {topic.articles.map((article, index) => {
                      const key = `${topic.id}:${index}`;
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
                          {open && <div className="faq-answer">{article.a}</div>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

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

            <nav className="profile-footer-links" aria-label="Policies">
              <Link href="/privacy">Privacy policy <ExternalLink size={12} /></Link>
              <Link href="/terms">Terms of service <ExternalLink size={12} /></Link>
              <Link href="/data-deletion">Data deletion <ExternalLink size={12} /></Link>
              <Link href="/support">Public support page <ExternalLink size={12} /></Link>
            </nav>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
