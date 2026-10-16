"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarCheck,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
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
import { backoffDelay } from "@/src/lib/client/workspace-data";
import { deferOnboarding, rememberOnboardingNotRequired } from "@/src/lib/onboarding/redirect";
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
import type { OnboardingAction, OnboardingView } from "@/src/lib/onboarding/view";
import type { FacebookPageChoice, OnboardingClient, OnboardingSave } from "./onboarding-client";
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

/** Step transitions: the old step fades out while the new one arrives. */
const LEAVE_MS = 160;

/** A failed step save is sent again after 1 s, 2 s, 4 s... (up to 30 s). */
const SAVE_RETRY_BASE_MS = 1_000;
const SAVE_RETRY_CAP_MS = 30_000;
/** Sends of one step save (the first and its resends) before it waits for Try again or the next step: about a minute and a half. */
export const SAVE_MAX_ATTEMPTS = 8;

/** The HTTP status a failed save carries, when the server answered. */
function failedStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * A refusal a resend cannot change: signed out, not allowed, or an answer
 * the server rejected. A timeout or "too many requests" can still go through.
 */
function resendCannotHelp(error: unknown): boolean {
  const status = failedStatus(error);
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

type SaveQueueOptions = {
  save: (body: OnboardingSave) => Promise<OnboardingView>;
  onSaved: (view: OnboardingView) => void;
  /** true when a save failed; false once every queued save is through. */
  onFailing: (failing: boolean) => void;
  /** A save came back 401: the session has ended, so nothing will save until they sign in again. */
  onSignedOut?: () => void;
  retryDelay?: (attempt: number) => number;
};

export type SaveQueue = {
  /**
   * Queues a save behind the ones before it. Answers pile up until a save
   * carrying them succeeds, so every request sends all unsaved answers.
   * With `retry`, a failure is sent again with backoff until it goes
   * through, until a newer save takes it over (that one carries the same
   * answers and a newer step), or until SAVE_MAX_ATTEMPTS sends. A refusal
   * (4xx) is never resent, and a hidden tab waits until it is visible again.
   * Resolves true once saved.
   */
  enqueue(body: OnboardingSave, options?: { retry?: boolean }): Promise<boolean>;
  /** "Try again": resend now instead of waiting out the backoff. */
  retryNow(): void;
  open(): void;
  close(): void;
};

export function createSaveQueue({ save, onSaved, onFailing, onSignedOut, retryDelay }: SaveQueueOptions): SaveQueue {
  const delay = retryDelay ?? ((attempt: number) => backoffDelay(attempt, { baseMs: SAVE_RETRY_BASE_MS, capMs: SAVE_RETRY_CAP_MS }));
  const unsaved: Record<string, unknown> = {};
  let tail: Promise<unknown> = Promise.resolve();
  let outstanding = 0;
  let generation = 0;
  let lastOk = true;
  let lastFailed: { step?: number; action?: OnboardingAction } | null = null;
  // The resend waiting on a backoff timer or on the tab becoming visible.
  let waiting: { cancel: () => void; resolve: () => void } | null = null;
  let closed = false;

  function wake() {
    if (!waiting) return;
    const { cancel, resolve } = waiting;
    waiting = null;
    cancel();
    resolve();
  }

  function pause(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { waiting = null; resolve(); }, ms);
      waiting = { cancel: () => clearTimeout(timer), resolve };
    });
  }

  /** A hidden tab does not resend; it waits until someone looks at it again. */
  function whenVisible(): Promise<void> {
    if (typeof document === "undefined" || !document.hidden) return Promise.resolve();
    return new Promise((resolve) => {
      const onChange = () => {
        if (document.hidden) return;
        document.removeEventListener("visibilitychange", onChange);
        waiting = null;
        resolve();
      };
      document.addEventListener("visibilitychange", onChange);
      waiting = { cancel: () => document.removeEventListener("visibilitychange", onChange), resolve };
    });
  }

  function enqueue(body: OnboardingSave, { retry = false }: { retry?: boolean } = {}): Promise<boolean> {
    if (body.answers) Object.assign(unsaved, body.answers);
    const ticket = ++generation;
    const intent = { ...(body.step !== undefined ? { step: body.step } : {}), ...(body.action ? { action: body.action } : {}) };
    outstanding += 1;
    // A save waiting to retry is taken over by this one.
    wake();

    const run = async (): Promise<boolean> => {
      for (let attempt = 1; !closed; attempt += 1) {
        const answers = { ...unsaved };
        const request: OnboardingSave = { ...intent, ...(Object.keys(answers).length > 0 ? { answers } : {}) };
        try {
          const view = await save(request);
          // Only what this save carried is settled; answers given meanwhile stay queued.
          for (const [key, value] of Object.entries(answers)) {
            if (unsaved[key] === value) delete unsaved[key];
          }
          lastOk = true;
          lastFailed = null;
          if (!closed) onSaved(view);
          return true;
        } catch (error) {
          lastOk = false;
          lastFailed = intent;
          if (!closed) {
            onFailing(true);
            if (failedStatus(error) === 401) onSignedOut?.();
          }
          // A newer save already queued carries these answers, so it goes next.
          if (!retry || closed || generation !== ticket) return false;
          // Try again, or the next step's save, sends these answers again.
          if (resendCannotHelp(error) || attempt >= SAVE_MAX_ATTEMPTS) return false;
          await pause(delay(attempt));
          if (generation === ticket && !closed) await whenVisible();
          if (generation !== ticket) return false;
        }
      }
      return false;
    };

    const result = tail.then(run);
    tail = result.finally(() => {
      outstanding -= 1;
      if (outstanding === 0 && lastOk && Object.keys(unsaved).length === 0 && !closed) onFailing(false);
    });
    return result;
  }

  return {
    enqueue,
    retryNow() {
      if (waiting) {
        wake();
        return;
      }
      if (outstanding > 0) return;
      if (lastFailed || Object.keys(unsaved).length > 0) void enqueue(lastFailed ?? {}, { retry: true });
    },
    open() {
      closed = false;
    },
    close() {
      closed = true;
      wake();
    },
  };
}

type Direction = "forward" | "back";

function toggle<T>(list: readonly T[] | undefined, value: T): T[] {
  const current = list ?? [];
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

/** One answer in a vertical list: optional icon, label, radio or checkbox. */
function OptionRow({ label, icon: Icon, glyph, selected, multiple = false, compact = false, onSelect }: {
  label: string;
  icon?: typeof Store;
  glyph?: ReactNode;
  selected: boolean;
  multiple?: boolean;
  compact?: boolean;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={styles.option} data-kind={multiple ? "check" : "radio"} data-compact={compact || undefined} aria-pressed={selected} onClick={onSelect}>
      {Icon ? <Icon className={styles.optionIcon} size={18} strokeWidth={1.75} aria-hidden="true" /> : null}
      {glyph ? <span className={styles.optionGlyph} aria-hidden="true">{glyph}</span> : null}
      <span className={styles.optionLabel}>{label}</span>
      <span className={styles.optionMark} aria-hidden="true">{multiple ? <Check size={13} strokeWidth={3} /> : null}</span>
    </button>
  );
}

function Chip({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={styles.chip} aria-pressed={selected} onClick={onSelect}>
      {label}
    </button>
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
  const [signedOut, setSignedOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facebookChoices, setFacebookChoices] = useState<FacebookPageChoice[] | null>(null);
  const [facebookChoice, setFacebookChoice] = useState("");
  const [facebookError, setFacebookError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const headingId = useId();
  const hintId = useId();

  const name = (owner ? answers.name : member.name) ?? "";
  const instagramName = connections.instagram.find((item) => item.status === "CONNECTED")?.username;
  const facebookName = connections.facebook.find((item) => item.status === "CONNECTED")?.pageName;
  const connectedLabel = instagramName ? `@${instagramName.replace(/^@/, "")}` : facebookName ?? null;

  // Saves go out one at a time, in order, each carrying every answer not
  // yet saved; the warning stays up until all of them are through.
  const saves = useMemo(() => createSaveQueue({
    save: (body) => client.save(body),
    onSaved: (next) => {
      setConnections(next.connections);
      setSignedOut(false);
    },
    onFailing: (failing) => {
      setSaveError(failing);
      if (!failing) setSignedOut(false);
    },
    onSignedOut: () => setSignedOut(true),
  }), [client]);
  useEffect(() => {
    saves.open();
    return () => saves.close();
  }, [saves]);
  /** Step moves retry on their own; a save someone waits on reports at once. */
  const persist = useCallback((body: OnboardingSave, options?: { retry?: boolean }) => saves.enqueue(body, options), [saves]);

  // A connect that came back successfully moves the resume point on too,
  // in turn with every other save.
  useEffect(() => {
    if (!owner || !returnedConnected || resumeStep > 7) return;
    void persist({ step: 8 }, { retry: true });
  }, [persist, owner, returnedConnected, resumeStep]);

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
      // Home can show at once: the shell need not wait to check onboarding.
      rememberOnboardingNotRequired(true);
      goTo(target, "forward");
      return;
    }
    goTo(target, "forward");
    void persist({ step: target, ...(cleaned ? { answers: cleaned } : {}) }, { retry: true });
    if (owner && target === 8) setPlanRequest((request) => request + 1);
  }

  function back() {
    if (step <= 1 || step >= doneStep) return;
    goTo(step - 1, "back");
    void persist({ step: step - 1 }, { retry: true });
  }

  async function skip() {
    if (busy) return;
    setBusy(true);
    const saved = await persist({ action: "skip" });
    setBusy(false);
    // Home would send them straight back while the skip is not saved, so
    // the shell holds the redirect off for a while instead.
    if (saved) rememberOnboardingNotRequired(true);
    else deferOnboarding();
    client.navigate("/dashboard");
  }

  /** Leaving for the builder (or Billing) from the plan finishes onboarding first. */
  async function openFromPlan(href: string) {
    if (busy) return;
    setBusy(true);
    const saved = await persist({ action: "complete" });
    setBusy(false);
    if (!saved) return;
    rememberOnboardingNotRequired(true);
    client.navigate(href);
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
      void persist({ step: 8 }, { retry: true });
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


  function renderStep(current: number, live: boolean): ReactNode {
    const title = owner ? ownerTitle(current, name) : memberTitle(current, name);
    const done = current === doneStep;
    return (
      <>
        {done ? (
          <span className={styles.doneMark} aria-hidden="true"><Check size={20} strokeWidth={2.5} /></span>
        ) : (
          <p className={`sr-only ${styles.counter}`}>Step {current} of {total}</p>
        )}
        <h1
          ref={live ? headingRef : undefined}
          id={live ? headingId : undefined}
          className={done ? `${styles.title} ${styles.titleDone}` : styles.title}
          tabIndex={-1}
        >
          {title.heading}
        </h1>
        {title.lede ? <p className={styles.lede}>{title.lede}</p> : null}
        <div className={styles.body}>{owner ? ownerBody(current) : memberBody(current)}</div>
      </>
    );
  }

  function nameField(value: string, onChange: (value: string) => void): ReactNode {
    return (
      <label className={`field ${styles.field}`}>
        <span>What should we call you?</span>
        <input
          value={value}
          maxLength={NAME_MAX}
          autoComplete="given-name"
          placeholder="Your first name"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  function ownerBody(current: number): ReactNode {
    switch (current) {
      case 1:
        return nameField(answers.name ?? "", (value) => setAnswers((currentAnswers) => ({ ...currentAnswers, name: value })));
      case 2:
        return (
          <div className={styles.options} role="group" aria-labelledby={headingId}>
            {ACCOUNT_TYPES.map((type) => (
              <OptionRow
                key={type}
                label={ACCOUNT_TYPE_LABELS[type]}
                icon={TYPE_ICONS[type]}
                selected={answers.accountType === type}
                onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, accountType: type }))}
              />
            ))}
          </div>
        );
      case 3:
        return (
          <>
            <div className={styles.chips} role="group" aria-labelledby={headingId}>
              {NICHES.map((niche) => (
                <Chip
                  key={niche}
                  label={NICHE_LABELS[niche]}
                  selected={answers.niches?.includes(niche) ?? false}
                  onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, niches: toggle(currentAnswers.niches, niche) }))}
                />
              ))}
            </div>
            {answers.niches?.includes("other") ? (
              <label className={`field ${styles.field} ${styles.fieldOther}`}>
                <span>Your space, in a few words</span>
                <input
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
            <div className={styles.options} role="group" aria-labelledby={headingId}>
              {AUDIENCE_SIZES.map((size) => (
                <OptionRow
                  key={size}
                  label={AUDIENCE_LABELS[size]}
                  selected={answers.audience === size}
                  onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, audience: size }))}
                />
              ))}
            </div>
            <p className={styles.groupLabel} id={`${headingId}-channels`}>Where do they follow you?</p>
            <div className={styles.options} role="group" aria-labelledby={`${headingId}-channels`}>
              {CHANNELS.map((channel) => (
                <OptionRow
                  key={channel}
                  multiple
                  compact
                  label={CHANNEL_LABELS[channel]}
                  glyph={channel === "instagram" ? <InstagramGlyph size={18} brand /> : <FacebookGlyph size={18} brand />}
                  selected={answers.channels?.includes(channel) ?? false}
                  onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, channels: toggle(currentAnswers.channels, channel) }))}
                />
              ))}
            </div>
          </>
        );
      case 5:
        return (
          <div className={styles.options} role="group" aria-labelledby={headingId}>
            {GOALS.map((goal) => (
              <OptionRow
                key={goal}
                multiple
                label={GOAL_LABELS[goal]}
                icon={GOAL_ICONS[goal]}
                selected={answers.goals?.includes(goal) ?? false}
                onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, goals: toggle(currentAnswers.goals, goal) }))}
              />
            ))}
          </div>
        );
      case 6:
        return (
          <>
            <p className={`${styles.groupLabel} ${styles.groupLabelFirst}`} id={`${headingId}-volume`}>Comments and DMs a day</p>
            <div className={`${styles.options} ${styles.optionsPaired}`} role="group" aria-labelledby={`${headingId}-volume`}>
              {DAILY_VOLUMES.map((volume) => (
                <OptionRow
                  key={volume}
                  label={DAILY_VOLUME_LABELS[volume]}
                  selected={answers.dailyVolume === volume}
                  onSelect={() => setAnswers((currentAnswers) => ({ ...currentAnswers, dailyVolume: volume }))}
                />
              ))}
            </div>
            <p className={styles.groupLabel} id={`${headingId}-mode`}>How do you reply now?</p>
            <div className={`${styles.options} ${styles.optionsPaired}`} role="group" aria-labelledby={`${headingId}-mode`}>
              {REPLY_MODES.map((mode) => (
                <OptionRow
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
        if (planState === "ready" && plan) return <OnboardingPlanView plan={plan} busy={busy} onOpen={(href) => void openFromPlan(href)} />;
        if (planState === "error") {
          return (
            <div className={styles.notice} role="alert">
              <span>Your setup couldn’t be built just now.</span>
              <button type="button" className={styles.textButton} onClick={() => setPlanRequest((request) => request + 1)}>Try again</button>
            </div>
          );
        }
        return (
          <div className={styles.loading} role="status">
            <span className="sr-only">Building your setup…</span>
            <span className={styles.loadingBlock} aria-hidden="true" />
            <span className={styles.loadingBlock} data-size="list" aria-hidden="true" />
          </div>
        );
      case 9:
        return (
          <div className={styles.doneActions}>
            <button type="button" className={`button button-primary ${styles.primary}`} onClick={() => client.navigate("/dashboard")}>Go to Home</button>
          </div>
        );
      default:
        return null;
    }
  }

  function connectBody(): ReactNode {
    const metaMessage = connectMessage(connectReturn?.meta, "Instagram");
    const facebookMessage = connectMessage(connectReturn?.facebook, "Facebook");
    const connectedState = (label: string) => (
      <span className={styles.connectState}>
        <Check size={16} strokeWidth={2.5} aria-hidden="true" />
        <span className="sr-only">Connected as </span>
        <span className={styles.connectHandle}>{label}</span>
      </span>
    );
    return (
      <div className={styles.connect}>
        {metaMessage || facebookMessage ? <p className={styles.notice} role="status">{metaMessage ?? facebookMessage}</p> : null}
        {facebookError ? <p className={styles.notice} role="alert">{facebookError}</p> : null}
        <ul className={styles.connectList}>
          <li className={styles.connectRow}>
            <span className={styles.connectIcon} aria-hidden="true"><InstagramGlyph size={20} brand /></span>
            <span className={styles.connectCopy}>
              <strong>Instagram account</strong>
              <span>Replies to comments, DMs and Story replies.</span>
            </span>
            {instagramName ? connectedState(`@${instagramName.replace(/^@/, "")}`) : view.canConnect ? (
              <a className={`button button-secondary ${styles.connectAction}`} href={client.connectHref.instagram} onClick={() => void persist({ step: 7 })}>Connect</a>
            ) : null}
          </li>
          <li className={styles.connectRow}>
            <span className={styles.connectIcon} aria-hidden="true"><FacebookGlyph size={20} brand /></span>
            <span className={styles.connectCopy}>
              <strong>Facebook Page</strong>
              <span>Replies to comments on your Page.</span>
            </span>
            {facebookName ? connectedState(facebookName) : view.canConnect && !facebookChoices ? (
              <a className={`button button-secondary ${styles.connectAction}`} href={client.connectHref.facebook} onClick={() => void persist({ step: 7 })}>Connect</a>
            ) : null}
            {facebookChoices ? (
              <div className={styles.pagePicker}>
                <label className={`field ${styles.field}`}>
                  <span>Which Page should Linkar reply on?</span>
                  <span className="select-wrap">
                    <select value={facebookChoice} onChange={(event) => setFacebookChoice(event.target.value)}>
                      {facebookChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}
                    </select>
                    <ChevronDown size={16} aria-hidden="true" />
                  </span>
                </label>
                <button type="button" className={`button button-secondary ${styles.connectAction}`} disabled={!facebookChoice || busy} onClick={() => void connectFacebookPage()}>Connect this Page</button>
              </div>
            ) : null}
          </li>
        </ul>
        {!view.canConnect && !connectedLabel ? <p className={styles.connectNote}>Only the owner or an admin can connect accounts.</p> : null}
      </div>
    );
  }

  function memberBody(current: number): ReactNode {
    if (current === 1) return nameField(member.name ?? "", (value) => setMember((currentMember) => ({ ...currentMember, name: value })));
    if (current === 2) {
      return (
        <div className={styles.options} role="group" aria-labelledby={headingId}>
          {MEMBER_FOCUSES.map((focus) => (
            <OptionRow
              key={focus}
              label={MEMBER_FOCUS_LABELS[focus]}
              icon={FOCUS_ICONS[focus]}
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
        {destination ? <button type="button" className={`button button-primary ${styles.primary}`} onClick={() => client.navigate(destination.href)}>{destination.label}</button> : null}
        <button type="button" className={`button ${destination ? "button-secondary" : "button-primary"} ${styles.primary}`} onClick={() => client.navigate("/dashboard")}>Go to Home</button>
      </div>
    );
  }

  // Connecting is the step's real action; without it the footer offers to
  // move on quietly instead of a primary button that would do the same.
  const laterOnly = owner && step === 7 && !connectedLabel;
  const continueLabel = owner ? (step === 8 ? "Finish" : "Continue") : step === 2 ? "Finish" : "Continue";
  const blocked = !canContinue(step);

  return (
    <div className={styles.shell} data-flow={view.flow} data-step={step}>
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
        {/* The website's step dashes: done and current steps in ink. */}
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={styles.progressStep} data-on={index < step ? "true" : "false"} />
        ))}
      </div>

      <main className={styles.main} aria-labelledby={headingId} data-done={step === doneStep ? "true" : undefined}>
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

        {step < doneStep ? (
          <footer className={styles.footer}>
            {saveError ? (
              <p className={styles.saveError} role="alert">
                {signedOut ? (
                  <>
                    You’ve been signed out, so your answers can’t save.
                    {/* A full page load: signing in starts a fresh session. */}
                    <a className={styles.textButton} href="/login?next=/onboarding">Sign in again</a>
                  </>
                ) : (
                  <>
                    Your answers didn’t save.
                    <button type="button" className={styles.textButton} onClick={() => saves.retryNow()}>Try again</button>
                  </>
                )}
              </p>
            ) : null}
            <div className={styles.footerRow}>
              {step > 1 ? (
                <button type="button" className={styles.back} onClick={back}>
                  <ArrowLeft size={16} aria-hidden="true" /> Back
                </button>
              ) : <span />}
              {laterOnly ? (
                <button type="button" className={styles.later} onClick={() => void next()}>I’ll do this later</button>
              ) : (
                <button
                  type="button"
                  className={`button button-primary ${styles.primary}`}
                  onClick={() => void next()}
                  aria-disabled={blocked || busy || undefined}
                  aria-describedby={blocked && step !== 8 ? hintId : undefined}
                >
                  {busy && step === doneStep - 1 ? "Saving…" : continueLabel}
                </button>
              )}
            </div>
            {blocked && step !== 8 ? (
              <p className="sr-only" id={hintId}>{owner && (step === 3 || step === 5) ? "Pick at least one to continue" : "Pick one to continue"}</p>
            ) : null}
          </footer>
        ) : null}
      </main>
    </div>
  );
}

function ownerTitle(step: number, name: string): { heading: string; lede?: string } {
  const first = name.trim().split(/\s+/)[0];
  switch (step) {
    case 1: return { heading: "Let’s set Linkar up for you.", lede: "A few quick questions, then a setup made for you." };
    case 2: return { heading: first ? `What best describes you, ${first}?` : "What best describes you?", lede: "This shapes the automations we suggest." };
    case 3: return { heading: "What’s your space?", lede: "Choose all that apply." };
    case 4: return { heading: "How big is your audience?", lede: "Roughly is fine." };
    case 5: return { heading: "What should your DMs do for you?", lede: "Choose all that apply." };
    case 6: return { heading: "How busy is your inbox?", lede: "Your best guess, across your accounts." };
    case 7: return { heading: "Connect your account.", lede: "Linkar replies from the account you connect." };
    case 8: return { heading: "Your setup.", lede: "Built from your answers, with the working shown." };
    default: return { heading: first ? `You’re all set, ${first}.` : "You’re all set.", lede: "Your recommended automations are waiting on Home." };
  }
}

function memberTitle(step: number, name: string): { heading: string; lede?: string } {
  const first = name.trim().split(/\s+/)[0];
  switch (step) {
    case 1: return { heading: "Welcome to the team.", lede: "Two quick questions and you’re in." };
    case 2: return { heading: first ? `What will you mainly do, ${first}?` : "What will you mainly do?", lede: "We’ll take you straight there." };
    default: return { heading: first ? `You’re in, ${first}.` : "You’re in.", lede: "Everything your team has set up is ready for you." };
  }
}
