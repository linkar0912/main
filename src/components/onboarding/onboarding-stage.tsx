"use client";

import type { CSSProperties } from "react";
import { BatteryFull, Camera, Check, ChevronLeft, Image as ImageIcon, Mic, Phone as PhoneIcon, Signal, Sticker, Video, Wifi } from "lucide-react";
import { InstagramGlyph } from "../instagram-glyph";
import { FacebookGlyph } from "../facebook-glyph";
import { LinkarMark } from "../linkar-mark";
import {
  ACCOUNT_TYPE_LABELS,
  AUDIENCE_LABELS,
  NICHE_LABELS,
  type AccountType,
  type AudienceSize,
  type DailyVolume,
  type Goal,
  type Niche,
  type OnboardingAnswers,
} from "@/src/lib/onboarding/answers";
import styles from "./onboarding.module.css";

/**
 * The live illustration beside each question: a phone that fills with the
 * kind of DMs the person just described, a crowd that grows with their
 * audience, a stream of comments at their daily pace. Purely decorative
 * (aria-hidden); every fact it shows is also in the question itself.
 */

type Bubble = { id: string; from: "them" | "you"; text: string };

const TYPE_SAMPLES: Record<AccountType, [string, string]> = {
  creator: ["Where is that jacket from?", "Here’s the link to everything I wore."],
  brand: ["Is this still in stock?", "Yes! Tap below to order yours."],
  agency: ["Can you send your rate card?", "Here it is. Want to book a call?"],
  coach: ["When does the next batch start?", "Monday. Here’s how to join."],
  other: ["Hi! Quick question", "Hi! Here’s what you need."],
};

const NICHE_SAMPLES: Record<Niche, string> = {
  fashion: "Is the black one in size M?",
  beauty: "Is this good for oily skin?",
  food: "Do you deliver to Andheri?",
  fitness: "Is the plan good for beginners?",
  education: "Is there a weekend batch?",
  tech: "Does it work with an iPhone?",
  travel: "How much is the Goa trip?",
  home: "What are the lamp’s dimensions?",
  finance: "Is the webinar free?",
  entertainment: "When is the next show?",
  other: "Can you tell me more?",
};

const GOAL_SAMPLES: Record<Goal, [string, string]> = {
  sell: ["Price?", "₹1,299. Tap to shop now."],
  leads: ["Send me the free guide", "Sure, what’s your email?"],
  faq: ["Do you ship to Pune?", "Yes, in 3 to 5 days."],
  book: ["Can I book a consultation?", "Pick a time that suits you."],
  grow: ["Link please!", "Follow us and it’s yours."],
  giveaways: ["Entering the giveaway!", "You’re in. Good luck!"],
  links: ["LINK", "Here you go, sent to your DMs."],
};

const STREAM_LINES = [
  "price?", "link please", "is this available?", "love this", "how do I order?", "do you ship to Delhi?",
  "details please", "size guide?", "where can I buy this?", "need this", "colour options?", "info",
];

const STREAM_TAGS: Record<NonNullable<OnboardingAnswers["replyMode"]>, string> = {
  myself: "You answer all of these today",
  team: "Your team answers these today",
  tool: "Another tool answers these today",
  none: "Most of these go unanswered today",
};

const CROWD_SIZE:Record<AudienceSize, number> = { under_1k: 4, "1k_10k": 9, "10k_50k": 15, "50k_200k": 22, "200k_plus": 30 };
const STREAM_SECONDS: Record<DailyVolume, number> = { under_10: 18, "10_50": 13, "50_200": 9, "200_1000": 6, "1000_plus": 4 };

/** The follower writing in. Fixed so the thread reads like a real DM. */
const FOLLOWER = { name: "Ananya", handle: "ananya.styles", initials: "A" };

function StatusBar() {
  return (
    <div className={styles.igStatus}>
      <span className={styles.igTime}>9:41</span>
      <span className={styles.igIsland} />
      <span className={styles.igSignals}>
        <Signal size={13} strokeWidth={2.4} />
        <Wifi size={13} strokeWidth={2.4} />
        <BatteryFull size={18} strokeWidth={2} />
      </span>
    </div>
  );
}

/**
 * An Instagram DM thread as the business sees it: the follower in the
 * header, their messages on the left in grey, the business's automatic
 * replies on the right in Instagram's purple-to-blue, "Seen" under the last
 * one, and the "Message..." composer. The person's answers shape the
 * messages; the captions under the phone name what they picked.
 */
function Phone({ name, caption, bubbles }: {
  name: string;
  caption?: string[];
  bubbles: Bubble[];
}) {
  const lastYou = [...bubbles].reverse().find((bubble) => bubble.from === "you")?.id;
  return (
    <div className={styles.phoneWrap}>
      <div className={styles.phone}>
        <StatusBar />
        <div className={styles.igHead}>
          <ChevronLeft size={24} strokeWidth={2.2} className={styles.igBack} />
          <span className={styles.igAvatar}>{FOLLOWER.initials}</span>
          <span className={styles.igWho}>
            <strong>{FOLLOWER.name}</strong>
            <span>{FOLLOWER.handle}</span>
          </span>
          <span className={styles.igActions}>
            <PhoneIcon size={21} strokeWidth={2} />
            <Video size={23} strokeWidth={2} />
          </span>
        </div>
        <div className={styles.phoneThread}>
          {/* A new thread opens on the follower's profile; once a few
              messages are in, it has scrolled away, as on Instagram. */}
          {bubbles.length <= 2 ? <div className={styles.igIntro}>
            <span className={styles.igIntroAvatar}>{FOLLOWER.initials}</span>
            <strong>{FOLLOWER.name}</strong>
            <span>{FOLLOWER.handle} · Instagram</span>
            <span className={styles.igIntroButton}>View profile</span>
          </div> : null}
          <p className={styles.phoneStamp}>Today 10:24</p>
          {bubbles.map((bubble, index) => (
            <div
              key={bubble.id}
              className={bubble.from === "you" ? styles.rowYou : styles.rowThem}
              style={{ "--bubble-delay": `${Math.min(index, 5) * 60}ms` } as CSSProperties}
            >
              {bubble.from === "them" ? <span className={styles.igMiniAvatar}>{FOLLOWER.initials}</span> : null}
              <p className={bubble.from === "you" ? styles.bubbleYou : styles.bubbleThem}>{bubble.text}</p>
              {bubble.id === lastYou ? <span className={styles.igSeen}>Seen</span> : null}
            </div>
          ))}
        </div>
        <div className={styles.igComposer}>
          <span className={styles.igCamera}><Camera size={17} strokeWidth={2.2} /></span>
          <span className={styles.igPlaceholder}>Message...</span>
          <Mic size={20} strokeWidth={2} />
          <ImageIcon size={20} strokeWidth={2} />
          <Sticker size={20} strokeWidth={2} />
        </div>
        <span className={styles.igHomeBar} />
      </div>
      {caption && caption.length > 0 ? (
        <p className={styles.phoneCaption} key={caption.join("|")}>
          <span>Replying as {name || "you"}</span>
          {caption.map((item) => <span key={item} className={styles.phoneCaptionTag}>{item}</span>)}
        </p>
      ) : (
        <p className={styles.phoneCaption}><span>Replying as {name || "you"}</span></p>
      )}
    </div>
  );
}

function Crowd({ audience, channels }: { audience?: AudienceSize; channels: string[] }) {
  const visible = audience ? CROWD_SIZE[audience] : 0;
  return (
    <div className={styles.crowd}>
      <p className={styles.crowdCaption} key={audience ?? "none"}>
        {audience ? AUDIENCE_LABELS[audience] : "Your audience"}
        <small>{audience ? "followers" : "Pick a size"}</small>
      </p>
      <div className={styles.crowdCluster}>
        {Array.from({ length: 30 }, (_, index) => (
          <span
            key={index}
            className={styles.crowdDot}
            data-on={index < visible ? "true" : "false"}
            data-tone={index % 3}
            style={{ "--dot-delay": `${(index % 10) * 28}ms` } as CSSProperties}
          />
        ))}
      </div>
      <div className={styles.crowdChannels}>
        <span className={styles.crowdChannel} data-on={channels.includes("instagram") ? "true" : "false"}><InstagramGlyph size={22} brand /></span>
        <span className={styles.crowdChannel} data-on={channels.includes("facebook") ? "true" : "false"}><FacebookGlyph size={22} brand /></span>
      </div>
    </div>
  );
}

function Stream({ volume, replyMode }: { volume?: DailyVolume; replyMode?: OnboardingAnswers["replyMode"] }) {
  const seconds = volume ? STREAM_SECONDS[volume] : 16;
  const lines = [...STREAM_LINES, ...STREAM_LINES];
  return (
    <div className={styles.stream}>
      <div className={styles.streamWindow}>
        <div className={styles.streamTrack} style={{ "--stream-seconds": `${seconds}s` } as CSSProperties} data-moving={volume ? "true" : "false"}>
          {lines.map((line, index) => (
            <span key={index} className={styles.streamItem} data-side={index % 2 ? "right" : "left"}>
              <span className={styles.streamAvatar} data-tone={index % 3} />
              {line}
            </span>
          ))}
        </div>
      </div>
      {replyMode ? (
        <span key={replyMode} className={styles.streamTag}>{STREAM_TAGS[replyMode]}</span>
      ) : null}
    </div>
  );
}

function ConnectArt({ connected }: { connected: string | null }) {
  return (
    <div className={styles.connectArt}>
      <span className={styles.connectNode}><InstagramGlyph size={34} brand /></span>
      <svg className={styles.connectLine} viewBox="0 0 120 8" aria-hidden="true" focusable="false">
        <path d="M2 4 H118" pathLength={1} data-connected={connected ? "true" : "false"} />
      </svg>
      <span className={`${styles.connectNode} ${styles.connectLinkar}`}><LinkarMark size={30} /></span>
      {connected ? (
        <span className={styles.connectDone}><Check size={16} strokeWidth={3} aria-hidden /> {connected}</span>
      ) : null}
    </div>
  );
}

export function OnboardingStage({ step, flow, answers, name, connected }: {
  step: number;
  flow: "owner" | "member";
  answers: OnboardingAnswers;
  name: string;
  connected: string | null;
}) {
  let art: React.ReactNode;
  const shownName = name || "You";
  if (flow === "member") {
    art = (
      <Phone
        name={shownName}
        caption={["Team"]}
        bubbles={[
          { id: "m1", from: "them", text: "Hi! Can someone help me with my order?" },
          { id: "m2", from: "you", text: `Hi, ${shownName} here. Happy to help.` },
        ]}
      />
    );
  } else if (step === 1) {
    art = (
      <Phone
        name={shownName}
        bubbles={[
          { id: "w1", from: "them", text: "Hi! Is this where I ask about your work?" },
          { id: "w2", from: "you", text: `Hi, I’m ${shownName}. Ask away, you’ll hear back in seconds.` },
        ]}
      />
    );
  } else if (step === 2) {
    const type = answers.accountType ?? "other";
    art = (
      <Phone
        name={shownName}
        caption={answers.accountType ? [ACCOUNT_TYPE_LABELS[answers.accountType]] : undefined}
        bubbles={[
          { id: `t-${type}-1`, from: "them", text: TYPE_SAMPLES[type][0] },
          { id: `t-${type}-2`, from: "you", text: TYPE_SAMPLES[type][1] },
        ]}
      />
    );
  } else if (step === 3) {
    const niches = answers.niches ?? [];
    const lead = niches[niches.length - 1];
    art = (
      <Phone
        name={shownName}
        caption={[
          ...(answers.accountType ? [ACCOUNT_TYPE_LABELS[answers.accountType]] : []),
          ...niches.slice(0, 3).map((niche) => niche === "other" && answers.nicheOther ? answers.nicheOther : NICHE_LABELS[niche]),
        ]}
        bubbles={lead ? [
          { id: `n-${lead}-1`, from: "them", text: NICHE_SAMPLES[lead] },
          { id: `n-${lead}-2`, from: "you", text: "Good question. Here are the details." },
        ] : [{ id: "n-empty", from: "them", text: "What do you post about?" }]}
      />
    );
  } else if (step === 4) {
    art = <Crowd audience={answers.audience} channels={answers.channels ?? []} />;
  } else if (step === 5) {
    const goals = answers.goals ?? [];
    const bubbles: Bubble[] = goals.slice(-3).flatMap((goal) => [
      { id: `g-${goal}-1`, from: "them" as const, text: GOAL_SAMPLES[goal][0] },
      { id: `g-${goal}-2`, from: "you" as const, text: GOAL_SAMPLES[goal][1] },
    ]);
    art = <Phone name={shownName} bubbles={bubbles.length > 0 ? bubbles : [{ id: "g-empty", from: "them", text: "Hi! I have a question" }]} />;
  } else if (step === 6) {
    art = <Stream volume={answers.dailyVolume} replyMode={answers.replyMode} />;
  } else {
    art = <ConnectArt connected={connected} />;
  }
  return (
    <div className={styles.stage} aria-hidden="true" data-step={step}>
      <div className={styles.stageArt} key={flow === "member" ? "member" : step <= 3 || step === 5 ? "phone" : step}>
        {art}
      </div>
    </div>
  );
}
