"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  CircleHelp,
  CreditCard,
  ExternalLink,
  Inbox,
  LayoutGrid,
  LifeBuoy,
  Mail,
  Megaphone,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Workflow,
  Wrench,
} from "lucide-react";
import { AppShell, useAccountIdentity } from "./app-shell";
import { FacebookGlyph } from "./facebook-glyph";
import { InstagramGlyph } from "./instagram-glyph";
import { helpArticleMatchesQuery, normalizeHelpQuery } from "@/src/lib/help-search";

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
    blurb: "What Linkar does, the ten-minute setup, and the words used everywhere else in the app.",
    icon: BookOpen,
    articles: [
      {
        q: "What is Linkar?",
        a: (
          <>
            A workspace for Instagram conversations and Facebook Page comment automation. You write
            deterministic rules - a trigger plus the actions it should take - and Linkar runs them
            against the events Meta sends you. Nothing is guessed and nothing is scraped: a reply
            only ever goes out because a rule you saved matched.
          </>
        ),
      },
      {
        q: "What's the fastest way to get value out of it?",
        a: (
          <>
            Three steps, and <Link href="/dashboard">Home</Link> tracks them for you. Connect an
            Instagram account or Facebook Page in <Link href="/settings">Settings</Link>, open{" "}
            <Link href="/automations">Automations</Link> and pick a ready-made template from the
            picker, then activate it. Most templates need nothing but a keyword and a message.
          </>
        ),
      },
      {
        q: "What's an automation?",
        a: (
          <>
            A trigger plus one or more actions. The trigger is the thing that happens on Meta&apos;s
            side - a comment, a DM, a story mention, a first-ever contact, an ad referral, an opt-in
            tap. The actions are what the person receives: a private reply, a DM, a link, a button, an
            image, or tappable reply chips.
          </>
        ),
      },
      {
        q: "Automations, campaigns, sequences, broadcasts - what's the difference?",
        a: (
          <>
            An <strong>automation</strong> reacts to one event with an immediate reply. A{" "}
            <strong>campaign</strong> is the follow-gated flow: public reply, opt-in DM, follow check,
            then delivery. A <strong>sequence</strong> is a timed multi-step DM journey people enroll
            into. A <strong>broadcast</strong> is one message sent once to a segment of your contacts.
          </>
        ),
      },
      {
        q: "Who can do what in a workspace?",
        a: (
          <>
            Owners and admins manage connections, team invitations, and every automation. Members can
            work with automations but not workspace-level settings. Your own role is shown on{" "}
            <Link href="/profile">My Profile</Link> and in the sidebar chip.
          </>
        ),
      },
    ],
  },
  {
    id: "connecting-instagram",
    title: "Connecting Instagram",
    blurb: "Which accounts qualify, the webhook fields Linkar needs, and reconnecting when one drops.",
    icon: InstagramGlyph,
    articles: [
      {
        q: "Which Instagram accounts work?",
        a: (
          <>
            Professional accounts - Business or Creator - linked to a Facebook Page. Personal accounts
            don&apos;t expose the messaging APIs automations rely on, so there&apos;s nothing Linkar can
            subscribe to.
          </>
        ),
      },
      {
        q: "What can Instagram automations do?",
        a: (
          <>
            Reply privately to a comment (the DM that lands in the commenter&apos;s inbox), send DM text,
            links, link buttons, images, and up to four tappable reply chips. Comment triggers get the
            single private reply Meta allows; DM-side triggers can chain several messages.
          </>
        ),
      },
      {
        q: "Why do I see “Some fields need a reconnect”?",
        a: (
          <>
            Meta requires every field Linkar listens on - comments, messages, quick-reply taps,
            postbacks, opt-ins, and referrals - to stay subscribed, and any of them can silently drop.
            Open <Link href="/settings">Settings</Link> and reconnect; Linkar re-subscribes everything
            in one pass. Until then, the events on the missing field never arrive.
          </>
        ),
      },
      {
        q: "How do I disconnect an account?",
        a: (
          <>
            <Link href="/settings">Settings</Link> → the Instagram connections card → Disconnect.
            Linkar also stops receiving updates from that account. Your automatic replies stay saved
            but remain quiet until you connect the account again.
          </>
        ),
      },
    ],
  },
  {
    id: "connecting-facebook",
    title: "Connecting Facebook Pages",
    blurb: "Page connections, why Facebook replies are public, and keeping the feed subscription healthy.",
    icon: FacebookGlyph,
    articles: [
      {
        q: "What can Facebook automations reply to?",
        a: (
          <>
            Facebook Page automations send public replies to top-level comments on Page posts.
            Page-authored comments and nested replies are ignored to prevent loops. Facebook does not
            use Instagram private-reply or DM actions. A public Page reply does not open a Messenger
            conversation and does not give Linkar permission to message that person.
          </>
        ),
      },
      {
        q: "Which Facebook permissions are required?",
        a: (
          <>
            The Page connection requests pages_show_list, pages_manage_metadata,
            pages_manage_engagement, pages_read_engagement, and pages_read_user_content. The person
            connecting must be allowed to manage the selected Page.
          </>
        ),
      },
      {
        q: "Why does Facebook webhook health show missing fields?",
        a: (
          <>
            Open <Link href="/settings">Settings</Link> and reconnect the Page. Linkar checks the
            current feed subscription without changing it, then reconnecting refreshes the Page
            subscription when needed.
          </>
        ),
      },
      {
        q: "Can one automation serve both Instagram and a Facebook Page?",
        a: (
          <>
            No - an automation is bound to one channel, because the actions differ. Pick the Instagram
            account or the Facebook Page in the builder&apos;s first step; choosing one clears the other.
            Duplicate the automation if you want the same idea running on both.
          </>
        ),
      },
    ],
  },
  {
    id: "automations",
    title: "Building automations",
    blurb: "Triggers, keyword matching, actions, personalization, guardrails, and testing before you go live.",
    icon: Workflow,
    articles: [
      {
        q: "Which triggers can I choose from?",
        a: (
          <>
            Post and Reel comments, direct messages, story mentions, first contact (someone&apos;s very
            first interaction with your account, ever), ad referrals, and opt-in taps. Meta never
            exposes follows through its API, so first contact is the compliant stand-in for
            &ldquo;welcome new followers&rdquo; - each person is greeted exactly once.
          </>
        ),
      },
      {
        q: "How do keywords work?",
        a: (
          <>
            Keyword matching is case-insensitive and takes a comma-separated list. Match mode decides
            how strictly: any keyword, all keywords, an exact whole-message match, a substring
            contains, or a regex. Negative keywords drop an event even when the positive match passed.
          </>
        ),
      },
      {
        q: "Can someone comment anything and still get a reply?",
        a: (
          <>
            Yes - set Match mode to <strong>Any comment</strong> and leave keywords empty, or start from
            the <strong>&ldquo;Comment anything, get a reply&rdquo;</strong> template in the picker. Every
            comment on the posts you scoped gets the private reply. The same applies to DMs via{" "}
            <strong>Any DM</strong>, which is how the Default Reply template works.
          </>
        ),
      },
      {
        q: "Can I limit an automation to certain posts?",
        a: (
          <>
            Yes. Comment triggers take an optional post scope - pick specific posts and Reels from the
            media picker, or leave it empty to watch everything. Campaigns go further and can also
            target &ldquo;all media&rdquo; or &ldquo;the next post you publish&rdquo;.
          </>
        ),
      },
      {
        q: "Can I personalize the message?",
        a: (
          <>
            Use <code>{"{username}"}</code> for the person&apos;s handle (or &ldquo;there&rdquo; when Meta
            doesn&apos;t supply one), <code>{"{keyword}"}</code> for the keyword that matched, and{" "}
            <code>{"{media}"}</code> for a friendly label for the post. Unknown tokens are left
            untouched, so a typo never corrupts a live reply.
          </>
        ),
      },
      {
        q: "What are follow-ups?",
        a: (
          <>
            A timed nudge sent after the flow&apos;s own messages - &ldquo;Still interested?&rdquo; a day
            later. Follow-ups are DM-side only, and each one is skipped if the person opted out or if
            Meta&apos;s 24-hour messaging window closed before it was due.
          </>
        ),
      },
      {
        q: "What guardrails can I set?",
        a: (
          <>
            A daily send limit per automation, enforced by the runner, and an activation window
            (&ldquo;active from&rdquo; / &ldquo;active until&rdquo;) so a launch flow switches itself off.
            Events outside the window are skipped, not queued.
          </>
        ),
      },
      {
        q: "Can I test before going live?",
        a: (
          <>
            Yes. Save as a draft, use the test preview in the builder to see the exact rendered
            messages, and check the review step&apos;s plain-English summary of what will fire. Once
            it&apos;s live, <Link href="/activity">Inbox</Link> shows every real execution.
          </>
        ),
      },
      {
        q: "Can I undo a change to an automation?",
        a: (
          <>
            Every save writes a version. Open the automation and use the versions history to compare
            and restore an earlier definition. Duplicating an automation is the safe way to try a
            variant without touching the live one.
          </>
        ),
      },
    ],
  },
  {
    id: "campaigns",
    title: "Follow-gated campaigns",
    blurb: "Public reply, opt-in DM, follow verification, and delivering the link only to followers.",
    icon: Sparkles,
    articles: [
      {
        q: "What is a follow gate?",
        a: (
          <>
            A campaign checks that the person follows you before delivering the goods. The opening DM
            asks them to follow and tap a button; only verified followers get the delivery message. You
            can also turn the gate off, in which case the link is sent right after the opt-in tap.
          </>
        ),
      },
      {
        q: "What does a campaign actually send?",
        a: (
          <>
            Four things in order: a public reply under the comment (up to five variations, rotated so
            your comment section doesn&apos;t read like a bot), an opening DM with an opt-in button, the
            follow check, then the delivery message with your link. Opening and delivery copy also
            support variations.
          </>
        ),
      },
      {
        q: "Someone stopped getting DMs after following.",
        a: (
          <>
            Instagram allows one follow-gated delivery per person per campaign. If they lost the
            thread, revoked messaging, or uninstalled the app, ask them to comment the keyword again -
            that starts a fresh participant record.
          </>
        ),
      },
    ],
  },
  {
    id: "leads",
    title: "Email capture & contacts",
    blurb: "Collecting emails in the DM, conversational questions, fulfillment mail, and your contact list.",
    icon: Mail,
    articles: [
      {
        q: "How does email capture work?",
        a: (
          <>
            Turn on the email collector in the builder and Linkar appends your prompt to the flow, waits
            for the next message from that person, validates it as an email address, stores it on their
            contact record, and sends your confirmation. A non-email reply gets the retry message, up to
            a small retry budget. Email capture is DM-side only - comment triggers can&apos;t use it.
          </>
        ),
      },
      {
        q: "Can I ask more than just the email?",
        a: (
          <>
            Yes - add questions after the email and Linkar asks them one at a time. Each answer is
            validated as text, email, phone, or number, and stored on the contact. Give a question stop
            words (&ldquo;no&rdquo;, &ldquo;skip&rdquo;) and a matching reply ends the queue politely
            instead of failing the lead.
          </>
        ),
      },
      {
        q: "Can Linkar email the deliverable itself?",
        a: (
          <>
            Yes. Set a delivery subject, message, and optional link, and the fulfillment email goes out
            the moment the address is stored - so the promise you made in the DM is kept without you
            touching anything.
          </>
        ),
      },
      {
        q: "Can I send leads to Zapier / Make / n8n?",
        a: (
          <>
            Add the receiving app&apos;s URL under “Send new leads to another app.” Linkar sends the
            person&apos;s answers there as soon as collection finishes. Your Zapier, Make, or n8n setup
            can then continue the work.
          </>
        ),
      },
      {
        q: "Where do captured contacts live?",
        a: (
          <>
            On <Link href="/contacts">Contacts</Link>, where you can search, filter, export, assign,
            and add notes. Open a contact from <Link href="/activity">Inbox</Link> to see its history
            or hand the conversation to a person, which pauses automation while your team takes over.
          </>
        ),
      },
      {
        q: "How does opting out work?",
        a: (
          <>
            Anyone who replies STOP is suppressed workspace-wide. They never enroll in a sequence, never
            continue one, and are skipped by broadcasts and follow-ups. This is not configurable, by
            design.
          </>
        ),
      },
    ],
  },
  {
    id: "sequences",
    title: "Sequences & broadcasts",
    blurb: "Timed multi-step DM journeys, one-off announcements, segments, and quiet hours.",
    icon: Megaphone,
    articles: [
      {
        q: "How do sequences enroll people?",
        a: (
          <>
            Point a sequence at an email-capture automation and every new lead from that flow enrolls
            automatically. Leave enrollment empty and the sequence stays dormant until something else
            enrolls into it. STOP contacts never enroll.
          </>
        ),
      },
      {
        q: "When do sequence messages actually send?",
        a: (
          <>
            Each step has a delay in hours - step one at 0 sends as soon as the scheduler runs after
            enrollment, and every later step counts from the previous one. Everything pauses during
            your workspace quiet hours. Direct replies to a person&apos;s own message are never delayed.
          </>
        ),
      },
      {
        q: "Who receives a broadcast?",
        a: (
          <>
            Pick a segment: leads with a captured email, all known contacts, or a win-back of people who
            have been quiet for 7 or 30+ days. Broadcasts fan out at roughly one message a second, skip
            STOP contacts, and can be scheduled for later.
          </>
        ),
      },
      {
        q: "Why were most of my win-back DMs skipped?",
        a: (
          <>
            Meta only lets you message someone within 24 hours of their last message to you. A win-back
            segment targets people who have been quiet, so most of them are outside that window and are
            skipped rather than spammed. That&apos;s the platform rule, not a Linkar limit.
          </>
        ),
      },
      {
        q: "What are quiet hours?",
        a: (
          <>
            A workspace-wide window in <Link href="/settings">Settings</Link> → Messaging quiet hours
            where Linkar holds outbound sends. Sequences, broadcasts, and follow-ups all wait it out.
            Immediate replies to someone who just messaged you are exempt.
          </>
        ),
      },
    ],
  },
  {
    id: "insights",
    title: "Inbox & insights",
    blurb: "The event feed, per-automation runs, the funnel, tracked links, and failure diagnosis.",
    icon: Inbox,
    articles: [
      {
        q: "What does the Inbox show?",
        a: (
          <>
            Every comment, DM, story mention, and link tap across your connected accounts, newest
            first - the same events your automations react to. Open a single automation for its own
            run history, including what was sent and what was skipped.
          </>
        ),
      },
      {
        q: "A run failed. Can I retry it?",
        a: (
          <>
            Yes - failed executions can be retried from the automation&apos;s activity view, and the
            delivery diagnostics panel groups failures by cause so you fix the reason rather than
            re-running blindly.
          </>
        ),
      },
      {
        q: "What do the insights numbers mean?",
        a: (
          <>
            The funnel counts participants by lifecycle state, the 14-day series shows replies sent and
            people reached per day, and per-post performance ranks which posts and Reels actually drive
            conversation. Home shows a condensed version of the same data.
          </>
        ),
      },
      {
        q: "How do tracked links work?",
        a: (
          <>
            Create a tracked link with an optional expiry and UTM parameters, use it as the destination
            in a flow, and Linkar counts total and unique clicks and attributes them back to the
            automation that sent it. That&apos;s how a campaign gets a real click-through number.
          </>
        ),
      },
    ],
  },
  {
    id: "team-plan",
    title: "Team, plan & limits",
    blurb: "Invitations, roles, what your plan allows, and what happens when a limit is reached.",
    icon: CreditCard,
    articles: [
      {
        q: "How do I invite someone?",
        a: (
          <>
            <Link href="/settings">Settings</Link> → Members &amp; invitations. Invite by email and pick
            their role. Team access is a plan-gated feature, so it&apos;s available when your plan
            includes it and within your member limit.
          </>
        ),
      },
      {
        q: "What does my plan allow?",
        a: (
          <>
            Plans cap connections, automations, sequences, monthly broadcasts, monthly deliveries, and
            team members, and switch features like sequences, broadcasts, tracked links, Facebook, and
            exports on or off. Your current plan is shown in the sidebar chip and on{" "}
            <Link href="/profile">My Profile</Link>; the exact allowances belong to that plan rather
            than being fixed in the app.
          </>
        ),
      },
      {
        q: "What happens when I hit a limit?",
        a: (
          <>
            The action is refused with a clear reason - not silently dropped. A monthly delivery cap
            stops new sends for the rest of the month; a count cap (automations, sequences,
            connections) blocks creating another until you remove one or move to a plan that allows
            more.
          </>
        ),
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    blurb: "Nothing sent? Check the connection, matching words, sending limits, and quiet hours.",
    icon: Wrench,
    articles: [
      {
        q: "My automation didn't reply. What do I check first?",
        a: (
          <>
            Check that the automatic reply is On, the account says Connected in{" "}
            <Link href="/settings">Settings</Link>, and the words someone wrote match the words you
            chose. Then check that the right post is selected, the daily limit has not been reached,
            and quiet hours are not delaying the reply. <Link href="/activity">Inbox</Link> shows
            what happened each time Linkar tried to reply.
          </>
        ),
      },
      {
        q: "The reply worked once and then stopped for the same person.",
        a: (
          <>
            Check whether the automation is set to reply once per commenter, and whether the flow is a
            first-contact or follow-gated one - both are deliberately once-per-person. Otherwise you
            may be outside Meta&apos;s 24-hour messaging window.
          </>
        ),
      },
      {
        q: "What is Meta's 24-hour messaging window?",
        a: (
          <>
            Meta only permits a DM within 24 hours of the person&apos;s last message to you. Immediate
            replies are always inside it; delayed things - follow-ups, sequence steps, broadcasts - may
            not be, and Linkar skips those rather than failing them.
          </>
        ),
      },
      {
        q: "The workspace says “Demo mode”.",
        a: (
          <>
            Demo mode runs on sample data until the server has a database and Meta credentials
            configured. Everything else works - you can build, preview, and explore - but nothing is
            sent to Instagram or Facebook.
          </>
        ),
      },
      {
        q: "A connection shows “Token expired”.",
        a: (
          <>
            Meta access tokens don&apos;t last forever, and a password change or permission revocation on
            Meta&apos;s side ends one early. Reconnect the account in{" "}
            <Link href="/settings">Settings</Link>; automations resume on the same definitions.
          </>
        ),
      },
    ],
  },
  {
    id: "account-security",
    title: "Account, privacy & data",
    blurb: "Passwords, sessions, email verification, and getting your data out or deleted.",
    icon: ShieldCheck,
    articles: [
      {
        q: "How do I change my password?",
        a: (
          <>
            <Link href="/profile">My Profile</Link> → Password &amp; sessions. Updating your password
            keeps your other devices signed in; &ldquo;Sign out all&rdquo; invalidates every session
            across all devices, including the one you&apos;re using.
          </>
        ),
      },
      {
        q: "Why does my email say Unverified?",
        a: (
          <>
            The signup confirmation hasn&apos;t been completed. <Link href="/profile">My Profile</Link>{" "}
            shows the status and a resend button (rate-limited, so wait a little between attempts).
            Verify it to keep full access to the workspace.
          </>
        ),
      },
      {
        q: "How is my Meta access protected?",
        a: (
          <>
            Linkar stores connection details securely, checks that incoming updates really came from
            the connected service, and safely ignores duplicates. Replies only follow rules you saved.
            Never paste a password or private connection key into a support email.
          </>
        ),
      },
      {
        q: "How do I export or delete my data?",
        a: (
          <>
            Contact exports live with your contacts when your plan includes exports. For deletion, see{" "}
            <Link href="/data-deletion">Data deletion</Link> - it covers both the self-serve route and
            an owner-initiated request, and returns a confirmation code to keep.
          </>
        ),
      },
    ],
  },
];

/**
 * `supportEmail` is optional: /help renders `<HelpScreen />` with no props so
 * the route stays a static client page instead of a force-dynamic server page
 * that blocks every navigation on a fresh server round trip. The runtime
 * SUPPORT_EMAIL still comes from the server - it rides along on the shell
 * bootstrap the sidebar already fetches - so it is never baked into the image
 * at build time. An explicit prop still wins, which keeps the component
 * testable and server-renderable.
 */
export function HelpScreen({ supportEmail }: { supportEmail?: string } = {}) {
  return (
    <AppShell>
      <HelpBody supportEmail={supportEmail} />
    </AppShell>
  );
}

function HelpBody({ supportEmail: supportEmailProp }: { supportEmail?: string }) {
  const { supportEmail: bootstrapSupportEmail } = useAccountIdentity();
  const supportEmail = supportEmailProp ?? bootstrapSupportEmail;
  const [query, setQuery] = useState("");
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [feedbackState, setFeedbackState] = useState<Record<string, "saving" | "sent" | "error">>({});
  const trackedNoResults = useRef(new Set<string>());

  useEffect(() => {
    const requestedTopic = new URLSearchParams(window.location.search).get("topic");
    if (requestedTopic && TOPICS.some((topic) => topic.id === requestedTopic)) {
      const timer = window.setTimeout(() => setActiveTopicId(requestedTopic), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, []);

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
          articles: topic.articles.filter((article) => helpArticleMatchesQuery(
            topic,
            { question: article.q, answer: article.a },
            query,
          )),
        }))
        .filter((topic) => topic.articles.length > 0);
    }
    if (activeTopicId) return TOPICS.filter((topic) => topic.id === activeTopicId);
    return TOPICS;
  }, [query, searching, activeTopicId]);

  const showGroupLabels = searching || activeTopicId === null;
  const activeTopic = TOPICS.find((topic) => topic.id === activeTopicId) ?? null;
  const totalArticles = TOPICS.reduce((sum, topic) => sum + topic.articles.length, 0);

  useEffect(() => {
    const normalized = normalizeHelpQuery(query);
    if (!normalized || visibleTopics.length > 0 || trackedNoResults.current.has(normalized)) return;
    const timer = window.setTimeout(() => {
      trackedNoResults.current.add(normalized);
      void fetch("/api/help/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "search", query: normalized, resultCount: 0 }),
      }).catch(() => {
        trackedNoResults.current.delete(normalized);
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [query, visibleTopics.length]);

  async function submitFeedback(articleKey: string, helpful: boolean) {
    if (feedbackState[articleKey] === "saving" || feedbackState[articleKey] === "sent") return;
    setFeedbackState((current) => ({ ...current, [articleKey]: "saving" }));
    try {
      const response = await fetch("/api/help/analytics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "feedback", articleKey, helpful }),
      });
      if (!response.ok) throw new Error("feedback failed");
      setFeedbackState((current) => ({ ...current, [articleKey]: "sent" }));
    } catch {
      setFeedbackState((current) => ({ ...current, [articleKey]: "error" }));
    }
  }

  return (
    <div className="page-wrap narrow-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">Support</p>
          <h1>Help</h1>
          <p className="muted page-lede">Guides and answers for every part of the workspace - searchable in one place.</p>
        </div>
      </header>

      <section className="help-search-shell" aria-label="Search help articles">
        <form
          className="help-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <Search aria-hidden size={20} strokeWidth={1.9} />
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
            <div className="help-topic-groups">
              {visibleTopics.map((topic) => (
                <div key={topic.id} className="help-topic-group">
                  {showGroupLabels && <p className="help-topic-group-label">{topic.title}</p>}
                  <div className="faq-list">
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
                          {open && (
                            <div className="faq-answer">
                              {article.a}
                              <div className="help-feedback" aria-label="Article feedback">
                                {feedbackState[key] === "sent" ? (
                                  <p role="status">Thanks for the feedback.</p>
                                ) : (
                                  <>
                                    <span>Was this helpful?</span>
                                    <button
                                      type="button"
                                      aria-label="Yes, this was helpful"
                                      disabled={feedbackState[key] === "saving"}
                                      onClick={() => void submitFeedback(key, true)}
                                    >
                                      <ThumbsUp size={14} /> Yes
                                    </button>
                                    <button
                                      type="button"
                                      aria-label="No, this was not helpful"
                                      disabled={feedbackState[key] === "saving"}
                                      onClick={() => void submitFeedback(key, false)}
                                    >
                                      <ThumbsDown size={14} /> No
                                    </button>
                                    {feedbackState[key] === "error" ? <em role="alert">Could not save feedback.</em> : null}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
            {supportEmail ? (
              <a className="button button-primary" href={`mailto:${supportEmail}`}>
                <Mail size={16} /> {supportEmail}
              </a>
            ) : (
              <span className="button button-primary" aria-hidden style={{ opacity: 0.55, pointerEvents: "none" }}>
                <Mail size={16} /> Loading support address…
              </span>
            )}
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
  );
}
