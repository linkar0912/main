"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarCheck,
  ChartNoAxesCombined,
  Check,
  Clapperboard,
  Gift,
  GraduationCap,
  Inbox,
  Link2,
  Mail,
  MessageCircleQuestionMark,
  Shapes,
  ShoppingBag,
  Store,
  UserPlus,
  Workflow,
} from "lucide-react";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { LinkarMark } from "../linkar-mark";
import { InstagramGlyph } from "../instagram-glyph";
import { FacebookGlyph } from "../facebook-glyph";
import { prefersReducedMotion } from "../ui/use-presence";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  AUDIENCE_LABELS,
  AUDIENCE_SIZES,
  CHANNELS,
  CHANNEL_LABELS,
  DAILY_VOLUMES,
  DAILY_VOLUME_LABELS,
  GOALS,
  GOAL_LABELS,
  MEMBER_FOCUSES,
  MEMBER_FOCUS_LABELS,
  MEMBER_STEP_COUNT,
  NAME_MAX,
  NICHES,
  NICHE_LABELS,
  NICHE_OTHER_MAX,
  OWNER_STEP_COUNT,
  REPLY_MODES,
  REPLY_MODE_LABELS,
  type MemberAnswers,
  type MemberFocus,
  type OnboardingAnswers,
} from "@/src/lib/onboarding/answers";
import type { OnboardingPlan } from "@/src/lib/onboarding/build-plan";
import type { OnboardingView } from "@/src/lib/onboarding/view";
import type { FacebookPageChoice, OnboardingClient, OnboardingSave } from "./onboarding-client";
import { OnboardingStage } from "./onboarding-stage";
import { OnboardingPlanView } from "./onboarding-plan";
import styles from "./onboarding.module.css";

/** ?meta= / ?facebook= from the connect flows' return redirect. */
export type ConnectReturn = { meta?: string; facebook?: string };

const TYPE_ICONS = { creator: Clapperboard, brand: Store, agency: BriefcaseBusiness, coach: GraduationCap, other: Shapes } as const;
const GOAL_ICONS = { sell: ShoppingBag, leads: Mail, faq: MessageCircleQuestionMark, book: CalendarCheck, grow: UserPlus, giveaways: Gift, links: Link2 } as const;
const FOCUS_ICONS = { inbox: Inbox, automations: Workflow, reports: ChartNoAxesCombined } as const;
const FOCUS_HOME: Record<MemberFocus, { href: string; label: string }> = {
  inbox: { href: "/activity", label: "Open the inbox" },
  automations: { href: "/automations", label: "See automations" },
  reports: { href: "/insights", label: "Open Insights" },
};

const CONNECT_MESSAGES: Record<string, string> = {
  cancelled: "Nothing was connected. You can try again, or do this later.",
  denied: "Instagram didn’t allow the connection. Try again, or do this later from Settings.",
  forbidden: "Only the owner or an admin can connect accounts.",
  "missing-config": "Connecting accounts isn’t set up here yet. You can do it later from Settings.",
  "plan-required": "Your plan doesn’t include another account. You can change plans in Billing later.",
  "limit-reached": "Your plan has no room for another account.",
  "already-connected": "That account is already connected to another Linkar workspace.",
  "no-pages": "We couldn’t find a Facebook Page you manage.",
};

function connectMessage(status: string | undefined, channel: "Instagram" | "Facebook"): string | null {
  if (!status || status === "connected" || status === "select-page") return null;
  return CONNECT_MESSAGES[status] ?? `${channel} couldn’t be connected. Try again, or do it later from Settings.`;
}

/** Step transitions: the old step leaves while the new one arrives. */
const LEAVE_MS = 220;

type Direction = "forward" | "back";

function toggle<T>(list: readonly T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function KeyHint({ index }: { index: number }) {
  return index < 9 ? <span className={styles.keyHint} aria-hidden="true">{index + 1}</span> : null;
}

/** One big selectable card: icon, label, keyboard hint. */
function ChoiceCard({ label, icon: Icon, selected, index, onSelect }: {
  label: string;
  icon?: typeof Store;
  selected: boolean;
  index?: number;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={styles.card} aria-pressed={selected} onClick={onSelect}>
      {Icon ? <span className={styles.cardIcon} aria-hidden="true"><Icon size={22} strokeWidth={1.8} /></span> : null}
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.cardMark} aria-hidden="true">{selected ? <Check size={14} strokeWidth={3} /> : null}</span>
      {index !== undefined ? <KeyHint index={index} /> : null}
    </button>
  );
}

function Chip({ label, selected, index, onSelect, children }: {
  label: string;
  selected: boolean;
  index?: number;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <button type="button" className={styles.chip} aria-pressed={selected} onClick={onSelect}>
      {children}
      <span>{label}</span>
      {index !== undefined ? <KeyHint index={index} /> : null}
    </button>
  );
}

function Sparks() {
  // Fourteen particles on a ring, each flying out once. Transform/opacity only.
  return (
    <span className={styles.sparks} aria-hidden="true">
      {Array.from({ length: 14 }, (_, index) => {
        const angle = (index / 14) * Math.PI * 2;
        const distance = 70 + (index % 3) * 22;
        return (
          <span
            key={index}
            className={styles.spark}
            data-tone={index % 3}
            style={{ "--dx": `${Math.cos(angle) * distance}px`, "--dy": `${Math.sin(angle) * distance}px`, "--spark-delay": `${(index % 4) * 30}ms` } as CSSProperties}
          />
        );
      })}
    </span>
  );
}

export type OnboardingFlowProps = {
  view: OnboardingView;
  client: OnboardingClient;
  connectReturn?: ConnectReturn;
  /** Dev preview: open on a given step without saving the move. */
  initialStep?: number;
  /** Dev preview: a plan to show instead of loading one. */
  initialPlan?: OnboardingPlan;
};

export function OnboardingFlow({ view, client, connectReturn, initialStep, initialPlan }: OnboardingFlowProps) {
  const owner = view.flow === "owner";
  const total = owner ? OWNER_STEP_COUNT : MEMBER_STEP_COUNT;
  const doneStep = total;
  const resumeStep = initialStep ?? (owner && view.completedAt ? OWNER_STEP_COUNT - 1 : view.step);
  const returnedConnected = connectReturn?.meta === "connected" || connectReturn?.facebook === "connected";
  const [step, setStep] = useState(() => {
    if (owner && returnedConnected && resumeStep <= 7) return 8;
    if (owner && (connectReturn?.meta || connectReturn?.facebook)) return Math.max(resumeStep, 7);
    return Math.min(Math.max(resumeStep, 1), total);
  });
  const [direction, setDirection] = useState<Direction>("forward");
  const [leaving, setLeaving] = useState<{ step: number; direction: Direction } | null>(null);
  // The first step paints still; every step after it arrives with motion.
  const [moved, setMoved] = useState(false);
  const [answers, setAnswers] = useState<OnboardingAnswers>(() => ({
    ...view.answers,
    name: view.answers.name ?? view.member.name ?? view.suggestedName ?? undefined,
    channels: view.answers.channels ?? ["instagram"],
  }));
  const [member, setMember] = useState<MemberAnswers>(() => ({ ...view.member, name: view.member.name ?? view.suggestedName ?? undefined }));
  const [connections, setConnections] = useState(view.connections);
  // Each visit to the plan step asks for a fresh plan (answers may have
  // changed); `planResult` records which request it answers.
  const [planRequest, setPlanRequest] = useState(0);
  const [planResult, setPlanResult] = useState<{ request: number; plan: OnboardingPlan | null } | null>(initialPlan ? { request: 0, plan: initialPlan } : null);
  const loadedRequest = useRef(initialPlan ? 0 : -1);
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facebookChoices, setFacebookChoices] = useState<FacebookPageChoice[] | null>(null);
  const [facebookChoice, setFacebookChoice] = useState("");
  const [facebookError, setFacebookError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const pendingSave = useRef<OnboardingSave | null>(null);
  const headingId = useId();
  const hintId = useId();

  const name = (owner ? answers.name : member.name) ?? "";
  const instagramName = connections.instagram.find((item) => item.status === "CONNECTED")?.username;
  const facebookName = connections.facebook.find((item) => item.status === "CONNECTED")?.pageName;
  const connectedLabel = instagramName ? `@${instagramName.replace(/^@/, "")}` : facebookName ?? null;

  const persist = useCallback(async (body: OnboardingSave) => {
    pendingSave.current = body;
    try {
      const next = await client.save(body);
      setConnections(next.connections);
      setSaveError(false);
      pendingSave.current = null;
      return true;
    } catch {
      setSaveError(true);
      return false;
    }
  }, [client]);

  // A connect that came back successfully moves the resume point on too.
  useEffect(() => {
    if (!owner || !returnedConnected || resumeStep > 7) return;
    client.save({ step: 8 }).then((next) => setConnections(next.connections)).catch(() => undefined);
  }, [client, owner, returnedConnected, resumeStep]);

  // Facebook asks which Page to connect before anything is saved.
  useEffect(() => {
    if (connectReturn?.facebook !== "select-page") return;
    let active = true;
    client.listFacebookPages()
      .then((choices) => {
        if (!active) return;
        setFacebookChoices(choices);
        setFacebookChoice(choices[0]?.id ?? "");
      })
      .catch((error: unknown) => { if (active) setFacebookError(error instanceof Error ? error.message : "Could not load your Facebook Pages"); });
    return () => { active = false; };
  }, [client, connectReturn?.facebook]);

  // The plan is computed on the server once the answers it needs are saved.
  useEffect(() => {
    if (!owner || step !== 8 || loadedRequest.current === planRequest) return;
    loadedRequest.current = planRequest;
    let active = true;
    client.loadPlan()
      .then((loaded) => { if (active) setPlanResult({ request: planRequest, plan: loaded }); })
      .catch(() => { if (active) setPlanResult({ request: planRequest, plan: null }); });
    return () => {
      active = false;
      // An abandoned request may be asked for again.
      if (loadedRequest.current === planRequest) loadedRequest.current = -1;
    };
  }, [client, owner, planRequest, step]);

  const currentPlan = planResult?.request === planRequest ? planResult : null;
  const planState: "loading" | "ready" | "error" = !currentPlan ? "loading" : currentPlan.plan ? "ready" : "error";
  const plan = currentPlan?.plan ?? null;

  // Focus follows the question so screen readers announce each step.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      if (step === 1 && !returnedConnected) return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step, returnedConnected]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  function goTo(next: number, nextDirection: Direction) {
    if (!prefersReducedMotion()) setLeaving({ step, direction: nextDirection });
    setDirection(nextDirection);
    setMoved(true);
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  /** Answers this step contributes, saved with the move to the next one. */
  function stepAnswers(current: number): Record<string, unknown> | undefined {
    if (!owner) {
      if (current === 1) return { name: member.name ?? "" };
      if (current === 2) return member.focus ? { focus: member.focus } : undefined;
      return undefined;
    }
    switch (current) {
      case 1: return { name: answers.name ?? "" };
      case 2: return { accountType: answers.accountType };
      case 3: return { niches: answers.niches ?? [], nicheOther: answers.niches?.includes("other") ? answers.nicheOther ?? "" : "" };
      case 4: return { audience: answers.audience, channels: answers.channels ?? [] };
      case 5: return { goals: answers.goals ?? [] };
      case 6: return { dailyVolume: answers.dailyVolume, replyMode: answers.replyMode };
      default: return undefined;
    }
  }

  function canContinue(current: number): boolean {
    if (!owner) return current !== 2 || Boolean(member.focus);
    switch (current) {
      case 2: return Boolean(answers.accountType);
      case 3: return (answers.niches?.length ?? 0) > 0;
      case 4: return Boolean(answers.audience) && (answers.channels?.length ?? 0) > 0;
      case 5: return (answers.goals?.length ?? 0) > 0;
      case 6: return Boolean(answers.dailyVolume) && Boolean(answers.replyMode);
      case 8: return planState === "ready" || planState === "error";
      default: return true;
    }
  }

  async function next() {
    if (busy || !canContinue(step) || step >= doneStep) return;
    const target = step + 1;
    const raw = stepAnswers(step);
    const cleaned = raw ? Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined)) : undefined;
    if (target === doneStep) {
      // Finishing is the one save worth waiting for: Home must not send
      // them straight back here.
      setBusy(true);
      const saved = await persist({ ...(cleaned ? { answers: cleaned } : {}), action: "complete" });
      setBusy(false);
      if (!saved) return;
      goTo(target, "forward");
      return;
    }
    goTo(target, "forward");
    void persist({ step: target, ...(cleaned ? { answers: cleaned } : {}) });
    if (owner && target === 8) setPlanRequest((request) => request + 1);
  }

  function back() {
    if (step <= 1 || step >= doneStep) return;
    goTo(step - 1, "back");
    void persist({ step: step - 1 });
  }

  async function skip() {
    if (busy) return;
    setBusy(true);
    await persist({ action: "skip" });
    setBusy(false);
    client.navigate("/dashboard");
  }

  /** Leaving for the builder (or Billing) from the plan finishes onboarding first. */
  async function openFromPlan(href: string) {
    if (busy) return;
    setBusy(true);
    const saved = await persist({ action: "complete" });
    setBusy(false);
    if (saved) client.navigate(href);
  }

  async function connectFacebookPage() {
    if (!facebookChoice || busy) return;
    setBusy(true);
    setFacebookError("");
    try {
      await client.selectFacebookPage(facebookChoice);
      const page = facebookChoices?.find((choice) => choice.id === facebookChoice);
      setConnections((current) => ({ ...current, facebook: [...current.facebook, { pageId: facebookChoice, pageName: page?.name ?? "Your Page", status: "CONNECTED" }] }));
      setFacebookChoices(null);
      goTo(8, "forward");
      void persist({ step: 8 });
      setPlanRequest((request) => request + 1);
    } catch (error) {
      setFacebookError(error instanceof Error ? error.message : "Could not connect that Page");
    } finally {
      setBusy(false);
    }
  }

  // Number keys pick from the step's main list; Enter continues. Typing in a
  // text field is left alone, and Escape does nothing destructive.
  const numberOptions = useMemo((): Array<() => void> => {
    if (!owner) return step === 2 ? MEMBER_FOCUSES.map((focus) => () => setMember((current) => ({ ...current, focus }))) : [];
    switch (step) {
      case 2: return ACCOUNT_TYPES.map((type) => () => setAnswers((current) => ({ ...current, accountType: type })));
      case 3: return NICHES.map((niche) => () => setAnswers((current) => ({ ...current, niches: toggle(current.niches, niche) })));
      case 4: return AUDIENCE_SIZES.map((size) => () => setAnswers((current) => ({ ...current, audience: size })));
      case 5: return GOALS.map((goal) => () => setAnswers((current) => ({ ...current, goals: toggle(current.goals, goal) })));
      case 6: return DAILY_VOLUMES.map((volume) => () => setAnswers((current) => ({ ...current, dailyVolume: volume })));
      default: return [];
    }
  }, [owner, step]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']");
      if (event.key === "Enter") {
        // Enter on a button presses that button; elsewhere it continues.
        if (target?.closest("button, a")) return;
        if (typing && target?.tagName !== "INPUT") return;
        event.preventDefault();
        void next();
        return;
      }
      if (typing) return;
      if (/^[1-9]$/.test(event.key)) {
        const pick = numberOptions[Number(event.key) - 1];
        if (pick) {
          event.preventDefault();
          pick();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const showStage = owner ? step <= 7 : step < doneStep;
  const progress = Math.min(1, step / total);

  function renderStep(current: number, live: boolean): ReactNode {
    const title = owner ? ownerTitle(current, name) : memberTitle(current, name);
    const heading = (
      <h1
        ref={live ? headingRef : undefined}
        id={live ? headingId : undefined}
        className={current === doneStep ? `${styles.title} ${styles.titleDone}` : styles.title}
        tabIndex={-1}
      >
        {title.heading}
      </h1>
    );
    return (
      <>
        {current === doneStep ? (
          <div className={styles.doneMark} aria-hidden="true">
            <span className={styles.doneCircle}><Check size={44} strokeWidth={3} /></span>
            {live ? <Sparks /> : null}
          </div>
        ) : null}
        {heading}
        {title.lede ? <p className={styles.lede}>{title.lede}</p> : null}
        <div className={styles.body}>{owner ? ownerBody(current) : memberBody(current)}</div>
      </>
    );
  }

  function ownerBody(current: number): ReactNode {
    switch (current) {
      case 1:
        return (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>What should we call you?</span>
            <input
              className={styles.input}
              value={answers.name ?? ""}
              maxLength={NAME_MAX}
              autoComplete="given-name"
              placeholder="Your first name"
              onChange={(event) => setAnswers((currentAnswers) => ({ ...currentAnswers, name: event.target.value }))}
            />
          </label>
        );
      case 2:
        return (
          <div className={styles.cardGrid} role="group" aria-labelledby={headingId}>
            {ACCOUNT_TYPES.map((type, index) => (
              <ChoiceCard
                key={type}
                label={ACCOUNT_TYPE_LABELS[type]}
                icon={TYPE_ICONS[type]}
                index={index}
                selected={answers.accountType === type}
                onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, accountType: type }))}
              />
            ))}
          </div>
        );
      case 3:
        return (
          <>
            <div className={styles.chipWrap} role="group" aria-labelledby={headingId}>
              {NICHES.map((niche, index) => (
                <Chip
                  key={niche}
                  label={NICHE_LABELS[niche]}
                  index={index}
                  selected={answers.niches?.includes(niche) ?? false}
                  onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, niches: toggle(currentAnswers.niches, niche) }))}
                />
              ))}
            </div>
            {answers.niches?.includes("other") ? (
              <label className={`${styles.field} ${styles.fieldInline}`}>
                <span className={styles.fieldLabel}>Tell us in a few words</span>
                <input
                  className={styles.input}
                  value={answers.nicheOther ?? ""}
                  maxLength={NICHE_OTHER_MAX}
                  placeholder="For example, pet care"
                  onChange={(event) => setAnswers((currentAnswers) => ({ ...currentAnswers, nicheOther: event.target.value }))}
                />
              </label>
            ) : null}
          </>
        );
      case 4:
        return (
          <>
            <div className={styles.chipWrap} role="group" aria-labelledby={headingId}>
              {AUDIENCE_SIZES.map((size, index) => (
                <Chip
                  key={size}
                  label={AUDIENCE_LABELS[size]}
                  index={index}
                  selected={answers.audience === size}
                  onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, audience: size }))}
                />
              ))}
            </div>
            <p className={styles.groupLabel} id={`${headingId}-channels`}>Where do they follow you?</p>
            <div className={styles.chipWrap} role="group" aria-labelledby={`${headingId}-channels`}>
              {CHANNELS.map((channel) => (
                <Chip
                  key={channel}
                  label={CHANNEL_LABELS[channel]}
                  selected={answers.channels?.includes(channel) ?? false}
                  onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, channels: toggle(currentAnswers.channels, channel) }))}
                >
                  {channel === "instagram" ? <InstagramGlyph size={18} brand /> : <FacebookGlyph size={18} brand />}
                </Chip>
              ))}
            </div>
          </>
        );
      case 5:
        return (
          <div className={`${styles.cardGrid} ${styles.cardGridWide}`} role="group" aria-labelledby={headingId}>
            {GOALS.map((goal, index) => (
              <ChoiceCard
                key={goal}
                label={GOAL_LABELS[goal]}
                icon={GOAL_ICONS[goal]}
                index={index}
                selected={answers.goals?.includes(goal) ?? false}
                onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, goals: toggle(currentAnswers.goals, goal) }))}
              />
            ))}
          </div>
        );
      case 6:
        return (
          <>
            <div className={styles.chipWrap} role="group" aria-labelledby={headingId}>
              {DAILY_VOLUMES.map((volume, index) => (
                <Chip
                  key={volume}
                  label={DAILY_VOLUME_LABELS[volume]}
                  index={index}
                  selected={answers.dailyVolume === volume}
                  onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, dailyVolume: volume }))}
                />
              ))}
            </div>
            <p className={styles.groupLabel} id={`${headingId}-mode`}>How do you reply now?</p>
            <div className={styles.chipWrap} role="group" aria-labelledby={`${headingId}-mode`}>
              {REPLY_MODES.map((mode) => (
                <Chip
                  key={mode}
                  label={REPLY_MODE_LABELS[mode]}
                  selected={answers.replyMode === mode}
                  onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, replyMode: mode }))}
                />
              ))}
            </div>
          </>
        );
      case 7:
        return connectBody();
      case 8:
        if (planState === "ready" && plan) return <OnboardingPlanView plan={plan} onOpen={(href) => void openFromPlan(href)} />;
        if (planState === "error") {
          return (
            <div className={styles.notice} role="alert">
              <p>Your plan couldn’t be built just now.</p>
              <button type="button" className={styles.textButton} onClick={() => setPlanRequest((request) => request + 1)}>Try again</button>
            </div>
          );
        }
        return <p className={styles.loading} role="status">Building your plan…</p>;
      case 9:
        return (
          <div className={styles.doneActions}>
            <button type="button" className={styles.primary} onClick={() => client.navigate("/dashboard")}>Go to Home</button>
          </div>
        );
      default:
        return null;
    }
  }

  function connectBody(): ReactNode {
    const metaMessage = connectMessage(connectReturn?.meta, "Instagram");
    const facebookMessage = connectMessage(connectReturn?.facebook, "Facebook");
    const hasAny = Boolean(instagramName || facebookName);
    return (
      <div className={styles.connect}>
        {metaMessage || facebookMessage ? <p className={styles.notice} role="status">{metaMessage ?? facebookMessage}</p> : null}
        {facebookChoices ? (
          <div className={styles.pagePicker}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Which Facebook Page should Linkar reply on?</span>
              <select className={styles.input} value={facebookChoice} onChange={(event) => setFacebookChoice(event.target.value)}>
                {facebookChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
              </select>
            </label>
            <button type="button" className={styles.secondary} disabled={!facebookChoice || busy} onClick={() => void connectFacebookPage()}>Connect this Page</button>
          </div>
        ) : null}
        {facebookError ? <p className={styles.notice} role="alert">{facebookError}</p> : null}
        <ul className={styles.connectList}>
          <li className={styles.connectRow}>
            <span className={styles.connectIcon}><InstagramGlyph size={24} brand /></span>
            <span className={styles.connectCopy}>
              <strong>Instagram</strong>
              <span>{instagramName ? `Connected as @${instagramName.replace(/^@/, "")}` : "Reply to comments, DMs and Story replies."}</span>
            </span>
            {instagramName ? (
              <span className={styles.connectState}><Check size={16} strokeWidth={3} aria-hidden /> Connected</span>
            ) : view.canConnect ? (
              <a className={styles.secondary} href={client.connectHref.instagram} onClick={() => void persist({ step: 7 })}>Connect</a>
            ) : null}
          </li>
          <li className={styles.connectRow}>
            <span className={styles.connectIcon}><FacebookGlyph size={24} brand /></span>
            <span className={styles.connectCopy}>
              <strong>Facebook Page</strong>
              <span>{facebookName ? `Connected to ${facebookName}` : "Reply to comments on your Page."}</span>
            </span>
            {facebookName ? (
              <span className={styles.connectState}><Check size={16} strokeWidth={3} aria-hidden /> Connected</span>
            ) : view.canConnect ? (
              <a className={styles.secondary} href={client.connectHref.facebook} onClick={() => void persist({ step: 7 })}>Connect</a>
            ) : null}
          </li>
        </ul>
        <p className={styles.connectNote}>
          {hasAny ? "You’re connected. Continue to see your plan." : "You can do this later from Settings. Your plan works either way."}
        </p>
      </div>
    );
  }

  function memberBody(current: number): ReactNode {
    if (current === 1) {
      return (
        <label className={styles.field}>
          <span className={styles.fieldLabel}>What should we call you?</span>
          <input
            className={styles.input}
            value={member.name ?? ""}
            maxLength={NAME_MAX}
            autoComplete="given-name"
            placeholder="Your first name"
            onChange={(event) => setMember((currentMember) => ({ ...currentMember, name: event.target.value }))}
          />
        </label>
      );
    }
    if (current === 2) {
      return (
        <div className={styles.cardGrid} role="group" aria-labelledby={headingId}>
          {MEMBER_FOCUSES.map((focus, index) => (
            <ChoiceCard
              key={focus}
              label={MEMBER_FOCUS_LABELS[focus]}
              icon={FOCUS_ICONS[focus]}
              index={index}
              selected={member.focus === focus}
              onSelect={() => setMember((currentMember) => ({ ...currentMember, focus }))}
            />
          ))}
        </div>
      );
    }
    const destination = member.focus ? FOCUS_HOME[member.focus] : null;
    return (
      <div className={styles.doneActions}>
        {destination ? <button type="button" className={styles.primary} onClick={() => client.navigate(destination.href)}>{destination.label}</button> : null}
        <button type="button" className={destination ? styles.secondary : styles.primary} onClick={() => client.navigate("/dashboard")}>Go to Home</button>
      </div>
    );
  }

  const continueLabel = owner
    ? step === 7 ? (connectedLabel ? "Continue" : "Do this later") : step === 8 ? "Finish" : "Continue"
    : step === 2 ? "Finish" : "Continue";
  const blocked = !canContinue(step);

  return (
    <div className={styles.shell} data-flow={view.flow} data-step={step} data-stage={showStage ? "true" : "false"}>
      <div className={styles.column}>
        <header className={styles.top}>
          <span className={styles.brand}>
            <LinkarMark className={styles.brandMark} />
            <span className={styles.brandName}>{PRODUCT_NAME}</span>
          </span>
          {step < doneStep ? (
            <button type="button" className={styles.skip} onClick={() => void skip()} disabled={busy}>Skip for now</button>
          ) : null}
        </header>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={step}
          aria-valuetext={`Step ${step} of ${total}`}
        >
          <span className={styles.progressFill} style={{ transform: `scaleX(${progress})` }} />
        </div>

        {showStage ? (
          <div className={styles.stageSlot}>
            <OnboardingStage step={step} flow={view.flow} answers={answers} name={name} connected={connectedLabel} />
          </div>
        ) : null}

        <main className={styles.main} aria-labelledby={headingId}>
          <div className={styles.backRow}>
            {step > 1 && step < doneStep ? (
              <button type="button" className={styles.back} onClick={back}>
                <ArrowLeft size={16} aria-hidden /> Back
              </button>
            ) : null}
          </div>
          <div className={styles.steps}>
            {leaving && leaving.step !== step ? (
              <section className={styles.step} data-motion="leave" data-direction={leaving.direction} aria-hidden="true" inert>
                {renderStep(leaving.step, false)}
              </section>
            ) : null}
            <section key={step} className={styles.step} data-motion={moved ? "enter" : "none"} data-direction={direction} data-step={step}>
              {renderStep(step, true)}
            </section>
          </div>
        </main>

        {step < doneStep ? (
          <footer className={styles.footer}>
            {saveError ? (
              <p className={styles.saveError} role="alert">
                Your answers didn’t save.
                <button type="button" className={styles.textButton} onClick={() => { if (pendingSave.current) void persist(pendingSave.current); }}>Try again</button>
              </p>
            ) : blocked && step !== 8 ? (
              <p className={styles.footerHint} id={hintId}>{owner && step !== 2 && step !== 4 && step !== 6 ? "Pick at least one to continue" : "Pick one to continue"}</p>
            ) : <span />}
            <button
              type="button"
              className={styles.primary}
              onClick={() => void next()}
              aria-disabled={blocked || busy || undefined}
              aria-describedby={blocked ? hintId : undefined}
              data-blocked={blocked ? "true" : undefined}
            >
              {busy && step === doneStep - 1 ? "Saving…" : continueLabel}
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function ownerTitle(step: number, name: string): { heading: string; lede?: string } {
  const first = name.trim().split(/\s+/)[0];
  switch (step) {
    case 1: return { heading: "Let’s set Linkar up for you", lede: "A few quick questions, about a minute, and you get a plan made for you." };
    case 2: return { heading: first ? `What best describes you, ${first}?` : "What best describes you?" };
    case 3: return { heading: "What’s your space?", lede: "Pick everything that fits." };
    case 4: return { heading: "How big is your audience?", lede: "Roughly is fine." };
    case 5: return { heading: "What should your DMs do for you?", lede: "Pick as many as you like." };
    case 6: return { heading: "How many comments and DMs a day?", lede: "Your best guess, across your accounts." };
    case 7: return { heading: "Connect your account", lede: "Linkar replies from the account you connect. It takes about a minute." };
    case 8: return { heading: first ? `Here’s your plan, ${first}` : "Here’s your plan", lede: "Built from your answers. Every number shows how we worked it out." };
    default: return { heading: first ? `You’re all set, ${first}` : "You’re all set", lede: "Your plan is waiting on Home." };
  }
}

function memberTitle(step: number, name: string): { heading: string; lede?: string } {
  const first = name.trim().split(/\s+/)[0];
  switch (step) {
    case 1: return { heading: "Welcome to the team", lede: "Two quick questions and you’re in." };
    case 2: return { heading: first ? `What will you mainly do, ${first}?` : "What will you mainly do?", lede: "We’ll take you straight there." };
    default: return { heading: first ? `You’re in, ${first}` : "You’re in", lede: "Everything your team has set up is ready for you." };
  }
}
