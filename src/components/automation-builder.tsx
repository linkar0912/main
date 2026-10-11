"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { PageHeader } from "./page-header";
import {
  AlertTriangle,
  CalendarClock,
  Film,
  Link2,
  Mail,
  MessageCircle,
  Plus,
  Send,
  Trash2,
  UserCheck,
} from "lucide-react";
import type { FlowAction, FlowCondition, FlowDefinition, FlowDefinitionV1, FlowDefinitionV2, MediaSnapshot } from "@/src/lib/automation/types";
import { MediaPicker } from "./media-picker";
import { FollowGateFields } from "./follow-gate-fields";
import { InstagramPreview, type DmBubble, type PreviewView } from "./instagram-preview";
import { FacebookPagePreview } from "./facebook-page-preview";
import { getInstagramConnections, getFacebookPages, type FacebookPageSummary } from "@/src/lib/client/workspace-data";
import { ChannelSelector } from "./automation-builder/channel-selector";
import { CommentKeywordControls, type CommentKeywordMode } from "./automation-builder/trigger-section";
import { CommentPostsField, ReplyOncePerPersonToggle } from "./automation-builder/comment-conditions-section";
import { PublicPageReplyVariants } from "./automation-builder/action-section";
import { AutomationPriorityField } from "./automation-builder/delivery-controls-section";
import {
  ReviewBeat,
  ReviewQuote,
  ReviewStory,
  channelPhrase,
  describeDelay,
  quotedList,
} from "./automation-builder/review-section";
import {
  BuilderFooter,
  BuilderStepper,
  ChoiceCards,
  Disclosure,
  Field,
  FieldError,
  KeywordInput,
  PersonalizeButtons,
  PreviewPanel,
  SaveState,
  StepGroup,
  ToggleRow,
  WizardStep,
  appendToken,
} from "./automation-builder/wizard";
import { ActionNotice } from "./action-notice";
import { toReadableApiError } from "@/src/lib/validation-error";
import { formatDateTime } from "@/src/lib/format-date";
import { useFocusTrap } from "./use-focus-trap";
import { useUnsavedChangesGuard } from "./automation-builder/unsaved-changes";

type AutomationBuilderProps = {
  automationId?: string;
  initialName?: string;
  initialDefinition?: FlowDefinition;
  initialInstagramAccountId?: string;
  initialFacebookPageId?: string;
  initialMediaIds?: string[];
  initialPriority?: number;
  onSaved?: (automation: unknown) => void;
};

type ConnectionSummary = { username: string; igUserId: string; avatarUrl?: string; status?: string };

/** Every Instagram account connected to this workspace, for the account picker and previews.
 * `loaded` lets callers tell "none connected" apart from "still loading". */
function useInstagramConnections(): { connections: ConnectionSummary[]; loaded: boolean } {
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    getInstagramConnections()
      .then((data) => {
        if (!active) return;
        setConnections(
          data
            .filter((connection) => Boolean(connection.username))
            .map((connection) => ({
              username: connection.username,
              igUserId: connection.igUserId ?? "",
              ...(connection.status ? { status: connection.status } : {}),
              ...(connection.profilePictureUrl ? { avatarUrl: connection.profilePictureUrl } : {}),
            })),
        );
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return { connections, loaded };
}

/** The account an automation pins to when nobody picked one: the first
 * CONNECTED account (an expired one would only fail at send time), falling
 * back to any account so an all-expired workspace still shows something. */
function defaultInstagramAccountId(connections: { igUserId?: string; status?: string }[]): string {
  return connections.find((item) => item.igUserId && item.status === "CONNECTED")?.igUserId
    || connections.find((item) => item.igUserId)?.igUserId
    || "";
}

/** Every Facebook Page connected to this workspace, for the page picker and the
 * Facebook preview. Mirrors `useInstagramConnections` so the two channels
 * can be interchanged by the channel toggle. */
function useFacebookPages(): { pages: FacebookPageSummary[]; loaded: boolean } {
  const [pages, setPages] = useState<FacebookPageSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    getFacebookPages()
      .then((data) => {
        if (!active) return;
        setPages(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return { pages, loaded };
}

/**
 * After the first save of a new automation, point the address bar at its edit
 * route so a reload (or Back/Forward) opens the saved automation instead of a
 * blank builder that would POST a duplicate. replaceState keeps the mounted
 * builder - and its success notice - in place; Next.js syncs its router to it.
 */
function adoptEditUrl(id: string) {
  if (typeof window === "undefined") return;
  if (!window.location.pathname.startsWith("/automations/new")) return;
  window.history.replaceState(window.history.state, "", `/automations/${encodeURIComponent(id)}/edit`);
}

const QUICK_REPLY_LABEL_MAX_LENGTH = 20;
const MAX_PUBLIC_REPLIES = 5;

function commaSeparated(values: string[]): string {
  return values.join(", ");
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Parses a comma-separated keyword field and drops case-insensitive duplicates, keeping the
 * first occurrence. The server normalizes keywords the same way (trim + lowercase) and rejects
 * the whole request with a raw Zod error if duplicates remain after normalization - deduping
 * here client-side avoids surfacing that confusing error for something like "Guide, guide".
 */
function parseKeywords(value: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const keyword of parseCommaSeparated(value)) {
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
  }
  return keywords;
}

/** Classic single/multi-response flow: comment, DM, referral, and opt-in triggers. */
const defaultDefinitionV1: FlowDefinitionV1 = {
  version: 1,
  trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
  conditions: [],
  actions: [{ type: "private_reply", text: "Thanks for asking - I’ll send that over now." }],
};

type ClassicTriggerType = FlowDefinitionV1["trigger"]["type"];
const MAX_CLASSIC_ACTIONS = 3;

/**
 * Every premade recipe ships example.com links so the shape of the flow is
 * obvious in the builder. They are valid URLs, so nothing else objects to them -
 * activating an untouched template just DMs followers a dead link. Surfaced as a
 * review-step warning rather than a blocker: example.com is legitimate in a
 * demo workspace, and the person saving is the one who knows.
 */
function isPlaceholderUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    return new URL(url.trim()).hostname.replace(/^www\./, "").endsWith("example.com");
  } catch {
    return false;
  }
}

function classicActionOptions(trigger: ClassicTriggerType, isFacebook = false): { value: FlowAction["type"]; label: string; description: string }[] {
  if (trigger === "comment") {
    return [{
      value: "private_reply",
      label: isFacebook ? "Public comment reply" : "Private reply",
      description: isFacebook ? "Reply publicly beneath the Facebook comment" : "Reply to the comment privately",
    }];
  }
  return [
    { value: "send_text", label: "Text message", description: "Send a plain text message" },
    { value: "send_image", label: "Photo", description: "Send a photo with a caption" },
    { value: "send_link", label: "Text with a link", description: "Deliver a link in a DM" },
    { value: "send_button", label: "Text with a link button", description: "Deliver a tappable link" },
    { value: "quick_replies", label: "Text with answer buttons", description: "A DM with tappable answer buttons" },
  ];
}

function newClassicAction(type: FlowAction["type"]): FlowAction {
  if (type === "private_reply") return { type, text: "" };
  if (type === "send_text") return { type, text: "" };
  if (type === "send_image") return { type, imageUrl: "", caption: "" };
  if (type === "send_link") return { type, text: "", url: "" };
  if (type === "quick_replies") return { type, text: "", replies: ["Yes", "Not now"] };
  return { type, text: "", buttonLabel: "Open link", url: "" };
}

/** datetime-local inputs produce "" or "YYYY-MM-DDTHH:mm" in the local zone. */
function localInputToIso(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Pretty-prints a datetime-local value ("2026-10-10T14:30") for the review step. */
function formatScheduleInput(value: string): string {
  const iso = localInputToIso(value);
  return iso ? formatDateTime(iso) : value;
}

function isoToLocalInput(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A failed check: the message plus the field it belongs to, so it can be
 * shown (and focused) next to that field instead of in a distant banner. */
type StepIssue = { field: string; message: string };

/**
 * Error plumbing shared by both builders. An issue on the visible step renders
 * inline under its field and moves focus there; anything else (save errors,
 * an issue on a step that isn't on screen) falls back to the footer notice.
 */
function useStepErrors(rootRef: RefObject<HTMLElement | null>) {
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<string | null>(null);

  useEffect(() => {
    if (!errorField) return;
    const root = rootRef.current;
    const target = root?.querySelector<HTMLElement>(".wizard-step:not(.is-hidden) [aria-invalid=\"true\"]")
      ?? root?.querySelector<HTMLElement>(".wizard-step:not(.is-hidden) [role=\"alert\"]");
    if (!target) return;
    if (target.matches("input, textarea, select")) target.focus({ preventScroll: true });
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView?.({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }, [error, errorField, rootRef]);

  return {
    error,
    errorField,
    /** Footer notice (save failures, issues on other steps). */
    fail(message: string) {
      setError(message);
      setErrorField(null);
    },
    showIssue(issue: StepIssue, inline: boolean) {
      setError(issue.message);
      setErrorField(inline ? issue.field : null);
    },
    clear() {
      setError("");
      setErrorField(null);
    },
    fieldError(field: string): string | null {
      return errorField === field && error ? error : null;
    },
  };
}

function scheduleSentence(scheduleStart: string, scheduleEnd: string): string | null {
  if (!scheduleStart && !scheduleEnd) return null;
  return `It runs${scheduleStart ? ` from ${formatScheduleInput(scheduleStart)}` : ""}${scheduleEnd ? ` until ${formatScheduleInput(scheduleEnd)}` : ""}.`;
}

/** The "how often and when" beat of a review story. */
function limitsSentences({ dailyLimit, scheduleStart, scheduleEnd, priority, oncePerPerson, noun }: {
  dailyLimit: string;
  scheduleStart: string;
  scheduleEnd: string;
  priority: string;
  oncePerPerson?: boolean;
  noun: string;
}): string[] {
  const sentences: string[] = [];
  if (oncePerPerson) sentences.push("Each person gets one reply, even if they comment again.");
  const parsedLimit = Number.parseInt(dailyLimit, 10);
  if (dailyLimit) sentences.push(`It stops for the day after ${Number.isFinite(parsedLimit) ? parsedLimit.toLocaleString("en-IN") : dailyLimit} ${noun}.`);
  const schedule = scheduleSentence(scheduleStart, scheduleEnd);
  if (schedule) sentences.push(schedule);
  const parsedPriority = Number.parseInt(priority, 10);
  if (Number.isFinite(parsedPriority) && parsedPriority !== 0) {
    sentences.push(`If another automation also matches, the higher priority wins (this one is ${parsedPriority}).`);
  }
  if (sentences.length === 0) sentences.push("No daily limit or end date. It keeps running until you turn it off.");
  return sentences;
}

const CLASSIC_STEP_LABELS: Record<string, string> = {
  trigger: "When it runs",
  condition: "Who gets it",
  action: "What it sends",
  email: "Ask for email",
  guardrails: "Limits",
  review: "Review",
};

function classicTriggerSentence(triggerType: ClassicTriggerType, isFacebook: boolean): string {
  if (triggerType === "comment") return isFacebook ? "Someone comments on a Page post" : "Someone comments on your post";
  if (triggerType === "message") return "Someone sends you a DM";
  if (triggerType === "first_contact") return "Someone messages you for the first time";
  if (triggerType === "story_reply") return "Someone replies to your Story";
  if (triggerType === "story_mention") return "Someone mentions you in their Story";
  if (triggerType === "referral") return "Someone opens your referral link";
  return "Someone taps your permission button";
}

function AutomationBuilderV1({
  automationId,
  initialName = "",
  initialDefinition = defaultDefinitionV1,
  initialInstagramAccountId = "",
  initialFacebookPageId = "",
  initialMediaIds = [],
  initialPriority = 0,
  onSaved,
}: {
  automationId?: string;
  initialName?: string;
  initialDefinition?: FlowDefinitionV1;
  initialInstagramAccountId?: string;
  initialFacebookPageId?: string;
  initialMediaIds?: string[];
  initialPriority?: number;
  onSaved?: (automation: unknown) => void;
}) {
  const [name, setName] = useState(initialName);
  const [instagramAccountId, setInstagramAccountId] = useState(initialInstagramAccountId);
  // Every save after the first PATCHes this id; without it each click POSTed a duplicate.
  const [savedAutomationId, setSavedAutomationId] = useState(automationId);
  const [channel, setChannel] = useState<"INSTAGRAM" | "FACEBOOK">(
    initialFacebookPageId ? "FACEBOOK" : "INSTAGRAM",
  );
  const { pages: facebookPages, loaded: facebookPagesLoaded } = useFacebookPages();
  // Default the channel off; once a Facebook page is selected the preview +
  // pin all use Facebook. If both fields are set on the server, the API will
  // return 400 so we clear the other channel when the user picks one.
  const [facebookPageId, setFacebookPageId] = useState(
    initialFacebookPageId || "",
  );
  const [triggerType, setTriggerType] = useState<ClassicTriggerType>(initialDefinition.trigger.type);
  const [triggerMatch, setTriggerMatch] = useState<"keyword" | "any">(
    initialDefinition.trigger.type === "comment" || initialDefinition.trigger.type === "message" || initialDefinition.trigger.type === "story_reply"
      ? initialDefinition.trigger.match
      : "keyword",
  );
  const [keywords, setKeywords] = useState(
    initialDefinition.trigger.type === "comment" || initialDefinition.trigger.type === "message" || initialDefinition.trigger.type === "story_reply"
      ? commaSeparated(initialDefinition.trigger.keywords)
      : "",
  );
  const [keywordMode, setKeywordMode] = useState<CommentKeywordMode>(
    initialDefinition.trigger.type === "comment" ? initialDefinition.trigger.mode ?? "any" : "any",
  );
  const [negativeKeywords, setNegativeKeywords] = useState(
    initialDefinition.trigger.type === "comment" ? commaSeparated(initialDefinition.trigger.negativeKeywords ?? []) : "",
  );
  const [replyOncePerUser, setReplyOncePerUser] = useState(
    initialDefinition.trigger.type === "comment" && Boolean(initialDefinition.trigger.replyOncePerUser),
  );
  const [mediaIds, setMediaIds] = useState(
    initialDefinition.trigger.type === "comment"
      ? commaSeparated([...new Set([...initialDefinition.trigger.mediaIds, ...initialMediaIds])])
      : "",
  );
  const [conditionType, setConditionType] = useState<"" | FlowCondition["type"]>(
    initialDefinition.conditions[0]?.type ?? "",
  );
  const [conditionValue, setConditionValue] = useState(() => {
    const condition = initialDefinition.conditions[0];
    if (!condition) return "";
    return condition.type === "contains_keyword"
      ? commaSeparated(condition.keywords)
      : commaSeparated(condition.mediaIds);
  });
  const [actions, setActions] = useState<FlowAction[]>(() =>
    initialDefinition.actions.length > 0 ? initialDefinition.actions : [newClassicAction("private_reply")],
  );
  const [emailCaptureEnabled, setEmailCaptureEnabled] = useState(Boolean(initialDefinition.emailCapture));
  const [emailPrompt, setEmailPrompt] = useState(initialDefinition.emailCapture?.promptText ?? "");
  const [emailRetry, setEmailRetry] = useState(initialDefinition.emailCapture?.retryText ?? "");
  const [emailConfirmation, setEmailConfirmation] = useState(initialDefinition.emailCapture?.confirmationText ?? "");
  const [deliveryEnabled, setDeliveryEnabled] = useState(Boolean(initialDefinition.emailCapture?.delivery));
  const [deliverySubject, setDeliverySubject] = useState(initialDefinition.emailCapture?.delivery?.subject ?? "");
  const [deliveryMessage, setDeliveryMessage] = useState(initialDefinition.emailCapture?.delivery?.message ?? "");
  const [deliveryLinkUrl, setDeliveryLinkUrl] = useState(initialDefinition.emailCapture?.delivery?.linkUrl ?? "");
  const [deliveryLinkLabel, setDeliveryLinkLabel] = useState(initialDefinition.emailCapture?.delivery?.linkLabel ?? "");
  const [notifyUrl, setNotifyUrl] = useState(initialDefinition.emailCapture?.notifyUrl ?? "");
  const [exitText, setExitText] = useState(initialDefinition.emailCapture?.exitText ?? "");
  type BuilderField = {
    id: string;
    question: string;
    kind: "text" | "email" | "phone" | "number";
    exitKeywords: string;
  };
  const [captureFields, setCaptureFields] = useState<BuilderField[]>(() =>
    (initialDefinition.emailCapture?.fields ?? []).map((field, index) => ({
      id: field.id || `field-${index + 1}`,
      question: field.question,
      kind: field.kind ?? "text",
      exitKeywords: commaSeparated(field.exitKeywords ?? []),
    })),
  );
  const [followUps, setFollowUps] = useState<{ delayMinutes: string; text: string; buttonLabel: string; url: string }[]>(
    () => (initialDefinition.followUps ?? []).map((followUp) => ({
      delayMinutes: String(followUp.delayMinutes),
      text: followUp.text,
      buttonLabel: followUp.buttonLabel ?? "",
      url: followUp.url ?? "",
    })),
  );
  const [scheduleStart, setScheduleStart] = useState(isoToLocalInput(initialDefinition.schedule?.startsAt));
  const [scheduleEnd, setScheduleEnd] = useState(isoToLocalInput(initialDefinition.schedule?.endsAt));
  const [dailyLimit, setDailyLimit] = useState(initialDefinition.dailySendLimit ? String(initialDefinition.dailySendLimit) : "");
  const [priority, setPriority] = useState(String(initialPriority));
  const [pendingIntent, setPendingIntent] = useState<"draft" | "activate" | null>(null);
  const [savedIntent, setSavedIntent] = useState<"draft" | "activate" | null>(null);
  const rootRef = useRef<HTMLFormElement>(null);
  const errors = useStepErrors(rootRef);
  const { error, fieldError } = errors;
  const [activeStep, setActiveStep] = useState(0);
  const [highestUnlockedStep, setHighestUnlockedStep] = useState(automationId ? 99 : 0);
  const [previewView, setPreviewView] = useState<PreviewView>(initialDefinition.trigger.type === "comment" ? "post" : "dm");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const previewRef = useRef<HTMLElement>(null);
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(previewRef, {
    active: mobilePreviewOpen,
    onEscape: () => setMobilePreviewOpen(false),
    initialFocusRef: previewCloseRef,
  });
  const { connections, loaded: connectionsLoaded } = useInstagramConnections();
  // Same rule as the campaign builder: an unpicked account defaults to the
  // first connected one, because the API requires every automation to be pinned.
  const selectedInstagramAccountId = instagramAccountId || defaultInstagramAccountId(connections);
  const connection = connections.find((item) => item.igUserId === selectedInstagramAccountId) ?? connections[0] ?? null;
  const connectedFacebookPageIds = new Set(
    facebookPages.filter((page) => page.status === "CONNECTED").map((page) => page.pageId),
  );
  // Thumbnails reported by the post picker so the phone preview can render
  // the real post. Display-only - never saved.
  const [mediaThumbs, setMediaThumbs] = useState<Record<string, { thumbnailUrl?: string; isReel?: boolean }>>({});
  const onMediaIndexChange = useCallback(
    (index: Record<string, { thumbnailUrl?: string; isReel?: boolean }>) => setMediaThumbs(index),
    [],
  );

  const usesTextTrigger = triggerType === "comment" || triggerType === "message" || triggerType === "story_reply";
  const isFacebook = channel === "FACEBOOK";
  const allowedActionTypes = classicActionOptions(triggerType, isFacebook);
  const hasEmailStep = triggerType !== "comment";

  // Keyword ideas from the workspace's own automations plus proven staples -
  // fetched once so the chips never flicker while typing.
  const [suggestions, setSuggestions] = useState<string[]>([]);
  useEffect(() => {
    if (!usesTextTrigger) return;
    let active = true;
    fetch("/api/automations/suggest-keywords")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data?: string[] } | null) => {
        if (active && Array.isArray(payload?.data)) setSuggestions(payload!.data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [usesTextTrigger]);

  const wizardSteps = [
    "trigger",
    ...(usesTextTrigger ? ["condition"] : []),
    "action",
    ...(hasEmailStep ? ["email"] : []),
    "guardrails",
    "review",
  ] as const;
  const clampedStep = Math.min(activeStep, wizardSteps.length - 1);
  const stepIndex = (key: string) => wizardSteps.indexOf(key as (typeof wizardSteps)[number]);
  const isStepHidden = (key: string) => clampedStep !== stepIndex(key);

  function previewViewForStep(key: string): PreviewView {
    if (triggerType !== "comment") return "dm";
    return key === "trigger" || key === "condition" ? "post" : "dm";
  }

  /** Where the automation will run; checked on the first step so a missing
   * Page or account surfaces before the person writes the whole flow. */
  function targetError(): string | null {
    if (channel === "FACEBOOK") {
      if (facebookPageId) return null;
      return facebookPagesLoaded && connectedFacebookPageIds.size === 0
        ? "Connect a Facebook Page in Settings before building a Page automation."
        : "Select a connected Facebook Page.";
    }
    if (connectionsLoaded && !selectedInstagramAccountId) {
      return "Connect an Instagram account in Settings before saving this automation.";
    }
    return null;
  }

  function validateStep(key: (typeof wizardSteps)[number]): StepIssue | null {
    if (key === "trigger") {
      if (!name.trim()) return { field: "name", message: "Give this automation a name first." };
      const target = targetError();
      if (target) return { field: "target", message: target };
      if (usesTextTrigger && triggerMatch === "keyword" && parseKeywords(keywords).length === 0) {
        return { field: "keywords", message: "Add at least one keyword." };
      }
    }
    if (key === "condition" && conditionType !== "" && parseCommaSeparated(conditionValue).length === 0) {
      return { field: "condition", message: "Add at least one word or post, or choose No extra check." };
    }
    if (key === "action") {
      if (actions.some((action) => action.type !== "send_image" && !action.text.trim())) return { field: "actions", message: "Every message needs text." };
      if (actions.some((action) => action.type === "send_image" && !action.imageUrl.trim())) return { field: "actions", message: "Add a link to the photo." };
      if (actions.some((action) => (action.type === "send_link" || action.type === "send_button") && !action.url.trim())) {
        return { field: "actions", message: "Add the link to send." };
      }
      if (actions.some((action) => action.type === "quick_replies" && !action.replies.some((reply) => reply.trim()))) {
        return { field: "actions", message: "Add at least one answer button." };
      }
      if (followUps.some((followUp) => followUp.text.trim() && followUp.buttonLabel.trim() && !followUp.url.trim())) {
        return { field: "followUps", message: "A reminder button needs a link." };
      }
    }
    if (key === "email") {
      if (emailCaptureEnabled && (!emailPrompt.trim() || !emailConfirmation.trim())) {
        return { field: "email", message: "Write the email question and the thank-you message." };
      }
      if (emailCaptureEnabled && deliveryEnabled && (!deliverySubject.trim() || !deliveryMessage.trim())) {
        return { field: "delivery", message: "The email needs a subject and a message." };
      }
    }
    if (key === "guardrails") {
      const startsAt = localInputToIso(scheduleStart);
      const endsAt = localInputToIso(scheduleEnd);
      if (scheduleStart && !startsAt) return { field: "schedule", message: "Enter a valid start date and time." };
      if (scheduleEnd && !endsAt) return { field: "schedule", message: "Enter a valid end date and time." };
      if (startsAt && endsAt && startsAt > endsAt) return { field: "schedule", message: "The start must come before the end of the schedule." };
    }
    return null;
  }

  // Any step can be opened from the stepper. Jumping ahead checks the steps
  // in between; the first one that is not finished opens instead, with its
  // problem shown on the field, so a click never silently does nothing.
  function goToStep(next: number) {
    const clamped = Math.max(0, Math.min(wizardSteps.length - 1, next));
    if (clamped > clampedStep) {
      for (let i = clampedStep; i < clamped; i++) {
        const issue = validateStep(wizardSteps[i]);
        if (issue) {
          setHighestUnlockedStep((current) => Math.max(current, i));
          setActiveStep(i);
          setPreviewView(previewViewForStep(wizardSteps[i]));
          errors.showIssue(issue, true);
          return;
        }
      }
      setHighestUnlockedStep((current) => Math.max(current, clamped));
    }
    errors.clear();
    setActiveStep(clamped);
    setPreviewView(previewViewForStep(wizardSteps[clamped]));
  }

  function goToNextStep() {
    const issue = validateStep(wizardSteps[clampedStep]);
    if (issue) {
      errors.showIssue(issue, true);
      return;
    }
    const next = Math.min(wizardSteps.length - 1, clampedStep + 1);
    errors.clear();
    setHighestUnlockedStep((current) => Math.max(current, next));
    setActiveStep(next);
    setPreviewView(previewViewForStep(wizardSteps[next]));
  }

  function updateAction(index: number, patch: Partial<FlowAction>) {
    setActions((current) => current.map((action, actionIndex) => {
      if (actionIndex !== index) return action;
      return { ...action, ...patch } as FlowAction;
    }));
  }

  function changeActionType(index: number, type: FlowAction["type"]) {
    setActions((current) => current.map((action, actionIndex) => {
      if (actionIndex !== index) return action;
      const previous = action;
      if (type === previous.type) return previous;
      if (type === "send_image") {
        return {
          type,
          imageUrl: "url" in previous ? previous.url : "",
          caption: "text" in previous ? previous.text : "",
        };
      }
      const carriedText = "text" in previous && typeof previous.text === "string" ? previous.text : "";
      if (type === "send_link") return { type, text: carriedText, url: "" };
      if (type === "send_button") return { type, text: carriedText, url: "", buttonLabel: "Open link" };
      if (type === "quick_replies") return { type, text: carriedText, replies: ["Yes", "Not now"] };
      return { type, text: carriedText };
    }));
  }

  function changeTriggerType(value: ClassicTriggerType) {
    setTriggerType(value);
    setActiveStep(0);
    setHighestUnlockedStep(0);
    setPreviewView(value === "comment" ? "post" : "dm");
    if (value === "comment") {
      setActions((current) => (current.every((action) => action.type === "private_reply") ? current : [newClassicAction("private_reply")]));
      setTriggerMatch((current) => current);
    }
    if (value === "message" || value === "referral" || value === "optin" || value === "first_contact" || value === "story_mention" || value === "story_reply") {
      setActions((current) => current.filter((action) => action.type !== "private_reply").length > 0
        ? current.filter((action) => action.type !== "private_reply")
        : [newClassicAction("send_text")]);
    }
    // Comment flows only support their channel's single immediate reply action.
    if (value === "comment") {
      setEmailCaptureEnabled(false);
      setFollowUps([]);
    }
  }

  function buildDefinition(): FlowDefinitionV1 {
    const trigger: FlowDefinitionV1["trigger"] =
      triggerType === "comment"
        ? {
            type: "comment",
            match: triggerMatch,
            keywords: triggerMatch === "keyword" ? parseKeywords(keywords) : [],
            mediaIds: parseCommaSeparated(mediaIds),
            ...(triggerMatch === "keyword" && keywordMode !== "any" ? { mode: keywordMode } : {}),
            ...(parseKeywords(negativeKeywords).length > 0
              ? { negativeKeywords: parseKeywords(negativeKeywords) }
              : {}),
            ...(replyOncePerUser ? { replyOncePerUser: true } : {}),
          }
        : triggerType === "message" || triggerType === "story_reply"
          ? {
              type: triggerType,
              match: triggerMatch,
              keywords: triggerMatch === "keyword" ? parseKeywords(keywords) : [],
            }
          : { type: triggerType };

    const conditions: FlowCondition[] =
      !usesTextTrigger || conditionType === ""
        ? []
        : conditionType === "contains_keyword"
          ? [{ type: conditionType, keywords: parseKeywords(conditionValue) }]
          : [{ type: conditionType, mediaIds: parseCommaSeparated(conditionValue) }];

    const schedule: FlowDefinitionV1["schedule"] = {};
    const startsAt = localInputToIso(scheduleStart);
    const endsAt = localInputToIso(scheduleEnd);
    if (startsAt) schedule.startsAt = startsAt;
    if (endsAt) schedule.endsAt = endsAt;

    const parsedLimit = Number.parseInt(dailyLimit, 10);

    return {
      version: 1,
      trigger,
      conditions,
      actions: actions.map((action) =>
        action.type === "send_image"
          ? {
              type: action.type,
              imageUrl: action.imageUrl.trim(),
              ...(action.caption?.trim() ? { caption: action.caption.trim() } : {}),
            }
          : action.type === "private_reply"
            ? {
                type: action.type,
                text: action.text.trim(),
                ...(action.textVariants?.map((text) => text.trim()).filter(Boolean).length
                  ? { textVariants: action.textVariants.map((text) => text.trim()).filter(Boolean) }
                  : {}),
              }
            : { ...action, text: action.text.trim() },
      ),
      ...(Number.isFinite(parsedLimit) && parsedLimit > 0 ? { dailySendLimit: parsedLimit } : {}),
      ...(startsAt || endsAt ? { schedule } : {}),
      ...(emailCaptureEnabled && triggerType !== "comment" && emailPrompt.trim() && emailConfirmation.trim()
        ? {
            emailCapture: {
              promptText: emailPrompt.trim(),
              ...(emailRetry.trim() ? { retryText: emailRetry.trim() } : {}),
              confirmationText: emailConfirmation.trim(),
              ...(deliveryEnabled && deliverySubject.trim() && deliveryMessage.trim()
                ? {
                    delivery: {
                      subject: deliverySubject.trim(),
                      message: deliveryMessage.trim(),
                      ...(deliveryLinkUrl.trim() ? { linkUrl: deliveryLinkUrl.trim() } : {}),
                      ...(deliveryLinkLabel.trim() && deliveryLinkUrl.trim()
                        ? { linkLabel: deliveryLinkLabel.trim() }
                        : {}),
                    },
                  }
                : {}),
              ...(notifyUrl.trim() ? { notifyUrl: notifyUrl.trim() } : {}),
              ...(captureFields.filter((field) => field.question.trim()).length > 0
                ? {
                    fields: captureFields
                      .filter((field) => field.question.trim())
                      .map((field, index) => ({
                        id: field.id || `field-${index + 1}`,
                        question: field.question.trim(),
                        ...(field.kind !== "text" ? { kind: field.kind } : {}),
                        ...(parseKeywords(field.exitKeywords).length > 0
                          ? { exitKeywords: parseKeywords(field.exitKeywords) }
                          : {}),
                      })),
                  }
                : {}),
              ...(exitText.trim() ? { exitText: exitText.trim() } : {}),
            },
          }
        : {}),
      // Nudges are offered by the editor for every non-comment trigger, so the
      // save gate has to match that exactly. Gating on `usesTextTrigger` instead
      // dropped them on first_contact/story_mention/referral/optin without a word.
      ...(triggerType === "comment"
        ? {}
        : followUps.length > 0
          ? {
              followUps: followUps
                .filter((followUp) => followUp.text.trim())
                .map((followUp) => ({
                  delayMinutes: Math.max(1, Math.min(10_080, Number.parseInt(followUp.delayMinutes, 10) || 60)),
                  text: followUp.text.trim(),
                  ...(followUp.buttonLabel.trim() && followUp.url.trim()
                    ? { buttonLabel: followUp.buttonLabel.trim(), url: followUp.url.trim() }
                    : {}),
                })),
            }
          : {}),
    };
  }

  /** Everything a save persists, for unsaved-changes tracking. Uses the raw
   * account pick rather than the defaulted one, so connections arriving after
   * mount don't read as an edit. */
  function dirtySnapshot(): string {
    return JSON.stringify({ name, channel, instagramAccountId, facebookPageId, priority, definition: buildDefinition() });
  }
  const [savedSnapshot, setSavedSnapshot] = useState(dirtySnapshot);
  const dirty = dirtySnapshot() !== savedSnapshot;
  useUnsavedChangesGuard(dirty);

  async function save(intent: "draft" | "activate") {
    errors.clear();
    setSavedIntent(null);
    if (!name.trim()) {
      errors.fail("Give this automation a name first.");
      return;
    }
    if (usesTextTrigger && triggerMatch === "keyword" && parseKeywords(keywords).length === 0) {
      errors.fail("Add at least one keyword.");
      return;
    }
    const startsAt = localInputToIso(scheduleStart);
    const endsAt = localInputToIso(scheduleEnd);
    if (scheduleStart && !startsAt) {
      errors.fail("Enter a valid start date and time.");
      return;
    }
    if (scheduleEnd && !endsAt) {
      errors.fail("Enter a valid end date and time.");
      return;
    }
    if (startsAt && endsAt && startsAt > endsAt) {
      errors.fail("The start must come before the end of the schedule.");
      return;
    }
    if (actions.some((action) => action.type !== "send_image" && !action.text.trim())) {
      errors.fail("Every message needs text.");
      return;
    }
    if (actions.some((action) => action.type === "send_image" && !action.imageUrl.trim())) {
      errors.fail("Add a link to the photo.");
      return;
    }
    if (actions.some((action) => (action.type === "send_link" || action.type === "send_button") && !action.url.trim())) {
      errors.fail("Add the link to send.");
      return;
    }
    if (actions.some((action) => action.type === "quick_replies" && !action.replies.some((reply) => reply.trim()))) {
      errors.fail("Add at least one answer button.");
      return;
    }
    if (followUps.some((followUp) => followUp.text.trim() && followUp.buttonLabel.trim() && !followUp.url.trim())) {
      errors.fail("A reminder button needs a link.");
      return;
    }
    if (emailCaptureEnabled && triggerType !== "comment" && (!emailPrompt.trim() || !emailConfirmation.trim())) {
      errors.fail("Write the email question and the thank-you message.");
      return;
    }
    if (emailCaptureEnabled && deliveryEnabled && (!deliverySubject.trim() || !deliveryMessage.trim())) {
      errors.fail("The email needs a subject and a message.");
      return;
    }
    setPendingIntent(intent);
    try {
      // Mutually exclusive: the API rejects dual-pinning, so the client only
      // sends the field that the user actually selected. The channel choice
      // is explicit so the saved payload never carries a pair of pins.
      const parsedPriority = Number.parseInt(priority, 10);
      const body: { provider: "INSTAGRAM" | "FACEBOOK"; name: string; definition: FlowDefinitionV1; priority?: number; status: "DRAFT" | "ACTIVE"; instagramAccountId?: string | null; facebookPageId?: string | null } = {
        provider: channel,
        name,
        definition: buildDefinition(),
        priority: Number.isFinite(parsedPriority) ? parsedPriority : 0,
        status: intent === "activate" ? "ACTIVE" : "DRAFT",
      };
      if (channel === "FACEBOOK") {
        if (!facebookPageId) throw new Error(targetError() ?? "Select a connected Facebook Page before saving.");
        body.facebookPageId = facebookPageId;
        body.instagramAccountId = null;
      } else {
        // The API requires a pin; "all accounts" (null) was always a 400.
        // A save racing the first connections load resolves the default itself.
        const accountId = selectedInstagramAccountId
          || defaultInstagramAccountId(await getInstagramConnections().catch(() => []));
        if (!accountId) throw new Error("Connect an Instagram account in Settings before saving this automation.");
        body.instagramAccountId = accountId;
        body.facebookPageId = null;
      }
      const snapshot = dirtySnapshot();
      const response = await fetch(savedAutomationId ? `/api/automations/${savedAutomationId}` : "/api/automations", {
        method: savedAutomationId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: { id?: string }; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not save this automation");
      if (payload.data.id) {
        if (!savedAutomationId) adoptEditUrl(payload.data.id);
        setSavedAutomationId(payload.data.id);
      }
      setSavedSnapshot(snapshot);
      onSaved?.(payload.data);
      setSavedIntent(intent);
    } catch (caught) {
      errors.fail(toReadableApiError(caught instanceof Error ? caught.message : caught, "Could not save this automation"));
    } finally {
      setPendingIntent(null);
    }
  }

  const dmMessages: DmBubble[] = actions.flatMap((action, index) => {
    const bubbles: DmBubble[] = [];
    if (action.type === "send_image" && action.imageUrl.trim()) {
      bubbles.push({ id: `action-${index}`, from: "bot", imageUrl: action.imageUrl });
    } else if (action.type !== "send_image" && action.text.trim()) {
      const answers = action.type === "quick_replies" ? action.replies.map((reply) => reply.trim()).filter(Boolean) : [];
      bubbles.push({ id: `action-${index}`, from: "bot", text: action.text, ...(answers.length > 0 ? { actions: answers } : {}) });
    }
    if (action.type === "send_button" && action.buttonLabel.trim()) {
      bubbles.push({ id: `action-${index}-button`, from: "tap", button: action.buttonLabel });
    }
    return bubbles;
  });

  // Covers every place a template can leave a placeholder behind: action links,
  // image sources, the fulfillment email's link, and follow-up nudge buttons.
  const hasPlaceholderLinks =
    actions.some((action) =>
      isPlaceholderUrl(action.type === "send_image" ? action.imageUrl : "url" in action ? action.url : undefined))
    || (deliveryEnabled && isPlaceholderUrl(deliveryLinkUrl))
    || followUps.some((followUp) => isPlaceholderUrl(followUp.url));

  const previewMediaId = triggerType === "comment" ? parseCommaSeparated(mediaIds)[0] : undefined;
  const previewThumb = previewMediaId ? mediaThumbs[previewMediaId] : undefined;
  // First non-empty reply text from the v1 action list. v2 stores replies in
  // `publicReplies`; v1 uses the `actions` array with a `private_reply` or
  // `send_text` action. We take any action's text to feed the FB preview.
  const firstReplyText = actions
    .map((a) => ("text" in a ? a.text.trim() : ""))
    .find((text) => Boolean(text));
  const selectedPage = facebookPages.find((page) => page.pageId === facebookPageId);

  const keywordList = parseKeywords(keywords);
  const textNoun = triggerType === "comment" ? "comment" : triggerType === "story_reply" ? "Story reply" : "message";
  const postCount = parseCommaSeparated(mediaIds).length;
  const activeFollowUps = followUps.filter((followUp) => followUp.text.trim());
  const multiMessage = triggerType !== "comment";

  function messageFields(action: FlowAction, index: number) {
    const replyLabel = isFacebook ? "Reply 1" : "Message text";
    return (
      <>
        {multiMessage && (
          <Field label="What to send">
            <select value={action.type} onChange={(event) => changeActionType(index, event.target.value as FlowAction["type"])}>
              {allowedActionTypes.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
        )}
        {action.type !== "send_image" && (
          <Field label={replyLabel} hint={<PersonalizeButtons onInsert={(token) => updateAction(index, { text: appendToken(action.text, token) })} />}>
            <textarea
              value={action.text}
              onChange={(event) => updateAction(index, { text: event.target.value })}
              rows={3}
              placeholder={isFacebook ? "Thanks for asking! Here are the details…" : "Write the exact message to send"}
              maxLength={1_000}
            />
          </Field>
        )}
        {isFacebook && action.type === "private_reply" && (
          <PublicPageReplyVariants variants={action.textVariants ?? []} onChange={(textVariants) => updateAction(index, { textVariants })} />
        )}
        {action.type === "send_image" && (
          <>
            <Field label="Photo link" hint="A public link to a .jpg or .png file.">
              <input
                value={action.imageUrl}
                onChange={(event) => updateAction(index, { imageUrl: event.target.value } as Partial<FlowAction>)}
                placeholder="https://your-site.com/photo.jpg"
                inputMode="url"
              />
            </Field>
            <Field label="Caption" optional hint="Sent as its own message right after the photo.">
              <textarea
                value={action.caption ?? ""}
                onChange={(event) => updateAction(index, { caption: event.target.value } as Partial<FlowAction>)}
                rows={2}
                maxLength={1_000}
              />
            </Field>
          </>
        )}
        {(action.type === "send_link" || action.type === "send_button") && (
          <div className="builder-field-row">
            <Field label="Link">
              <input value={action.url} onChange={(event) => updateAction(index, { url: event.target.value } as Partial<FlowAction>)} placeholder="https://your-site.com/guide" inputMode="url" />
            </Field>
            {action.type === "send_button" && (
              <Field label="Button text" className="is-short">
                <input value={action.buttonLabel} onChange={(event) => updateAction(index, { buttonLabel: event.target.value } as Partial<FlowAction>)} placeholder="Open guide" />
              </Field>
            )}
          </div>
        )}
        {action.type === "quick_replies" && (
          <div className="builder-subfields">
            <p className="builder-subfields-title">Answer buttons</p>
            <div className="builder-field-row">
              {[0, 1, 2, 3].map((chipIndex) => (
                <Field label={`Answer ${chipIndex + 1}`} optional={chipIndex > 1} key={chipIndex}>
                  <input
                    value={action.replies[chipIndex] ?? ""}
                    maxLength={QUICK_REPLY_LABEL_MAX_LENGTH}
                    placeholder={chipIndex === 0 ? "Sounds good" : chipIndex === 1 ? "Not now" : undefined}
                    onChange={(event) => {
                      const next = [...action.replies];
                      while (next.length < 4) next.push("");
                      next[chipIndex] = event.target.value;
                      updateAction(index, { replies: next } as Partial<FlowAction>);
                    }}
                  />
                </Field>
              ))}
            </div>
            <p className="builder-note">Up to four buttons, 20 characters each. When someone taps one, its text comes back to you as their reply.</p>
          </div>
        )}
      </>
    );
  }

  function reviewMessage(action: FlowAction, index: number) {
    if (action.type === "send_image") {
      return <ReviewQuote key={index} text={`Photo${action.caption?.trim() ? `, then “${action.caption.trim()}”` : ""}`} />;
    }
    const button = action.type === "send_button" ? action.buttonLabel.trim() || undefined : undefined;
    const tail = action.type === "send_link" && action.url.trim() ? ` ${action.url.trim()}` : "";
    const answers = action.type === "quick_replies" ? action.replies.filter((reply) => reply.trim()) : [];
    return (
      <span className="review-quote-group" key={index}>
        <ReviewQuote text={`${action.text.trim() || "(no text yet)"}${tail}`} button={button} />
        {answers.length > 0 ? <span className="review-answers">{answers.map((answer) => <span key={answer}>{answer}</span>)}</span> : null}
      </span>
    );
  }

  const triggerBeat = (() => {
    // Comments read "Someone comments “x” on any of your posts"; the other
    // triggers keep their own sentence and add the words after it.
    let sentence = triggerType === "comment" ? "Someone comments" : classicTriggerSentence(triggerType, isFacebook);
    if (usesTextTrigger && triggerMatch === "keyword") {
      sentence += keywordList.length
        ? `${triggerType === "comment" ? "" : " with"} ${quotedList(keywordList)}`
        : " with a keyword (add one in step 1)";
    }
    if (triggerType === "comment") {
      sentence += postCount > 0
        ? ` on ${postCount} chosen post${postCount === 1 ? "" : "s"}`
        : isFacebook ? " on any of your Page’s posts" : " on any of your posts";
    }
    sentence += ".";
    if (usesTextTrigger && conditionType === "contains_keyword") {
      sentence += ` It only replies if the ${textNoun} also contains ${quotedList(parseKeywords(conditionValue))}.`;
    } else if (usesTextTrigger && conditionType === "media_is") {
      const count = parseCommaSeparated(conditionValue).length;
      sentence += ` It only replies on ${count} chosen post${count === 1 ? "" : "s"}.`;
    }
    return sentence;
  })();

  const actionLead = triggerType === "comment"
    ? isFacebook
      ? `Your Page replies under their comment${(actions[0]?.type === "private_reply" && (actions[0].textVariants ?? []).filter((text) => text.trim()).length > 0) ? ", taking turns between your versions, starting with" : ""}:`
      : "Linkar sends them a private DM:"
    : actions.length === 1
      ? "Linkar replies with:"
      : `Linkar replies with ${actions.length} messages, in order:`;

  const reminderBeat = activeFollowUps.length > 0
    ? `Then ${activeFollowUps.length} reminder message${activeFollowUps.length === 1 ? " follows" : "s follow"}, ${activeFollowUps
      .map((followUp) => describeDelay(Math.max(1, Math.min(10_080, Number.parseInt(followUp.delayMinutes, 10) || 60))))
      .join(" and ")} later.`
    : null;

  const notice = error && !errors.errorField
    ? <ActionNotice tone="error" message={error} onDismiss={errors.clear} />
    : !error && savedIntent
      ? (
        <ActionNotice
          tone="success"
          message={savedIntent === "activate" ? "Saved and turned on." : "Saved to your workspace as a draft."}
          onDismiss={() => setSavedIntent(null)}
        />
      )
      : null;

  return (
    <form ref={rootRef} className="builder-layout" onSubmit={(event) => { event.preventDefault(); void save("activate"); }}>
      <div className="builder-main">
        <PageHeader
          className="builder-header"
          title={savedAutomationId ? "Edit automatic reply" : "New automatic reply"}
          description="Choose when it runs and what it says. Nothing goes live until you turn it on."
          tabs={(
            <BuilderStepper
              steps={wizardSteps.map((key) => ({ label: CLASSIC_STEP_LABELS[key] }))}
              active={clampedStep}
              unlocked={highestUnlockedStep}
              onSelect={goToStep}
            />
          )}
        />

        <WizardStep
          hidden={isStepHidden("trigger")}
          title="When should this run?"
          description="Pick the account, then what someone does to start it."
        >
          <StepGroup title="Where should it run?">
            <ChannelSelector
              channel={channel}
              instagramAccountId={selectedInstagramAccountId}
              facebookPageId={facebookPageId}
              instagramConnections={connections}
              instagramLoaded={connectionsLoaded}
              facebookPages={facebookPages}
              facebookLoaded={facebookPagesLoaded}
              error={fieldError("target")}
              onChannelChange={(next) => {
                if (next === channel) return;
                if (channel === "FACEBOOK") {
                  const confirmed = window.confirm(
                    "Changing channel will remove the selected Facebook Page and any Page-only reply settings. Continue?",
                  );
                  if (!confirmed) return;
                }
                setChannel(next);
                if (next === "INSTAGRAM") setFacebookPageId("");
                if (next === "FACEBOOK") {
                  changeTriggerType("comment");
                  setActions((current) => current[0]?.type === "private_reply" ? [current[0]] : [newClassicAction("private_reply")]);
                  // One connected Page is the only possible answer - pick it.
                  if (!facebookPageId && connectedFacebookPageIds.size === 1) {
                    setFacebookPageId([...connectedFacebookPageIds][0]);
                    setInstagramAccountId("");
                  }
                }
              }}
              onInstagramAccountChange={(accountId) => {
                setInstagramAccountId(accountId);
                if (accountId) setFacebookPageId("");
              }}
              onFacebookPageChange={(pageId) => {
                setFacebookPageId(pageId);
                if (pageId) {
                  setChannel("FACEBOOK");
                  setInstagramAccountId("");
                  changeTriggerType("comment");
                }
              }}
            />
          </StepGroup>

          <StepGroup title="What starts it?">
            <div className="builder-field-row">
              <Field label="Starts when">
                <select value={triggerType} onChange={(event) => changeTriggerType(event.target.value as ClassicTriggerType)}>
                  <option value="comment">{classicTriggerSentence("comment", isFacebook)}</option>
                  {!isFacebook && <option value="message">{classicTriggerSentence("message", false)}</option>}
                  {!isFacebook && <option value="first_contact">{classicTriggerSentence("first_contact", false)}</option>}
                  {!isFacebook && <option value="story_reply">{classicTriggerSentence("story_reply", false)}</option>}
                  {!isFacebook && <option value="story_mention">{classicTriggerSentence("story_mention", false)}</option>}
                  {!isFacebook && <option value="referral">{classicTriggerSentence("referral", false)}</option>}
                  {!isFacebook && <option value="optin">{classicTriggerSentence("optin", false)}</option>}
                </select>
              </Field>
              {usesTextTrigger && (
                <Field label={`Which ${textNoun === "Story reply" ? "Story replies" : `${textNoun}s`} count?`}>
                  <select value={triggerMatch} onChange={(event) => setTriggerMatch(event.target.value as "keyword" | "any")}>
                    <option value="keyword">Only ones with certain words</option>
                    <option value="any">Every {textNoun}</option>
                  </select>
                </Field>
              )}
            </div>
            {usesTextTrigger && triggerMatch === "keyword" && (
              <KeywordInput
                label="Words to look for"
                value={keywords}
                onChange={setKeywords}
                placeholder="price, link, guide"
                hint="Press Enter after each word. Capital letters don’t matter."
                error={fieldError("keywords")}
                suggestions={suggestions}
              />
            )}
            {triggerType === "comment" && (
              <CommentPostsField
                mediaIds={mediaIds}
                provider={channel}
                onMediaIdsChange={setMediaIds}
                onMediaIndexChange={onMediaIndexChange}
              />
            )}
            {triggerType === "comment" && (
              <Disclosure
                summary="More matching options"
                initiallyOpen={keywordMode !== "any" || Boolean(negativeKeywords.trim()) || replyOncePerUser}
              >
                {triggerMatch === "keyword" && (
                  <CommentKeywordControls
                    mode={keywordMode}
                    negativeKeywords={negativeKeywords}
                    onModeChange={setKeywordMode}
                    onNegativeKeywordsChange={setNegativeKeywords}
                  />
                )}
                <ReplyOncePerPersonToggle checked={replyOncePerUser} onChange={setReplyOncePerUser} />
              </Disclosure>
            )}
          </StepGroup>

          <StepGroup title="Name it">
            <Field label="Automation name" hint="Only you see this. It helps you find it later." error={fieldError("name")}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Send the price list"
                maxLength={120}
              />
            </Field>
          </StepGroup>
        </WizardStep>

        {usesTextTrigger && (
          <WizardStep
            hidden={isStepHidden("condition")}
            title="Who should it reply to?"
            optional
            description={`It replies to every ${textNoun} that matches step 1. Add a second check only if you need one.`}
          >
            <Field label="Only reply if">
              <select value={conditionType} onChange={(event) => setConditionType(event.target.value as "" | FlowCondition["type"])}>
                <option value="">No extra check</option>
                <option value="contains_keyword">The {textNoun} also contains certain words</option>
                <option value="media_is">It’s on one of certain posts</option>
              </select>
            </Field>
            {conditionType === "contains_keyword" && (
              <KeywordInput
                label="Words it must also contain"
                value={conditionValue}
                onChange={setConditionValue}
                placeholder="size, colour"
                hint="Press Enter after each word."
                error={fieldError("condition")}
              />
            )}
            {conditionType === "media_is" && isFacebook && (
              <Field label="Post IDs" hint="Separate several with commas." error={fieldError("condition")}>
                <input value={conditionValue} onChange={(event) => setConditionValue(event.target.value)} />
              </Field>
            )}
            {conditionType === "media_is" && !isFacebook && (
              <div className="builder-field">
                <p className="builder-subfields-title">Only these posts</p>
                <MediaPicker
                  selectedIds={parseCommaSeparated(conditionValue)}
                  onChange={(ids) => setConditionValue(commaSeparated(ids))}
                />
                <FieldError message={fieldError("condition")} />
              </div>
            )}
          </WizardStep>
        )}

        <WizardStep
          hidden={isStepHidden("action")}
          title={isFacebook ? "What should it reply publicly?" : "What should it reply?"}
          description={
            triggerType === "comment"
              ? isFacebook
                ? "Your Page posts this under their comment, where everyone can see it."
                : "Linkar sends this privately to their DMs. It’s the only message a comment can start."
              : "Write the messages Linkar sends back, in order."
          }
        >
          {actions.map((action, index) => (
            multiMessage ? (
              <fieldset className="message-editor" key={index}>
                <legend>Message {index + 1}</legend>
                {actions.length > 1 && (
                  <button
                    className="icon-button message-editor-remove"
                    type="button"
                    aria-label={`Remove message ${index + 1}`}
                    onClick={() => setActions((current) => current.filter((_, actionIndex) => actionIndex !== index))}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                {messageFields(action, index)}
              </fieldset>
            ) : (
              <div className="message-editor is-single" key={index}>{messageFields(action, index)}</div>
            )
          ))}
          <FieldError message={fieldError("actions")} />
          {/* Only comment flows are capped at a single action (the schema
              enforces one private reply); every DM-side trigger, keyword
              matched or not, can chain up to MAX_CLASSIC_ACTIONS messages. */}
          {multiMessage && actions.length < MAX_CLASSIC_ACTIONS && (
            <div className="builder-add-row">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setActions((current) => [...current, newClassicAction("send_text")])}
              >
                <Plus size={16} /> Add another message
              </button>
              <p>{actions.length > 1 ? "Messages send in order, one after another." : `Up to ${MAX_CLASSIC_ACTIONS} messages, sent in order.`}</p>
            </div>
          )}
          {multiMessage && (
            <StepGroup
              title="Send a reminder later?"
              description="For example “Still interested?” a day later. Linkar skips it if the person asked you to stop, or if Instagram no longer allows a reply."
            >
              {followUps.map((followUp, index) => (
                <fieldset className="message-editor" key={index}>
                  <legend>Reminder {index + 1}</legend>
                  <button
                    className="icon-button message-editor-remove"
                    type="button"
                    aria-label={`Remove reminder ${index + 1}`}
                    onClick={() => setFollowUps((current) => current.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={16} />
                  </button>
                  <Field
                    label="Wait before sending (minutes)"
                    className="is-short"
                    hint={describeDelay(Number.parseInt(followUp.delayMinutes, 10)) ? `Sends ${describeDelay(Number.parseInt(followUp.delayMinutes, 10))} later.` : "60 is an hour, 1440 is a day."}
                  >
                    <input
                      type="number"
                      min={1}
                      max={10_080}
                      value={followUp.delayMinutes}
                      onChange={(event) =>
                        setFollowUps((current) => current.map((f, i) => (i === index ? { ...f, delayMinutes: event.target.value } : f)))}
                    />
                  </Field>
                  <Field
                    label="Reminder message"
                    hint={<PersonalizeButtons onInsert={(token) => setFollowUps((current) => current.map((f, i) => (i === index ? { ...f, text: appendToken(f.text, token) } : f)))} />}
                  >
                    <textarea
                      value={followUp.text}
                      onChange={(event) =>
                        setFollowUps((current) => current.map((f, i) => (i === index ? { ...f, text: event.target.value } : f)))}
                      rows={2}
                      maxLength={1_000}
                      placeholder="Still interested? 👋 Your offer ends tonight."
                    />
                  </Field>
                  <div className="builder-field-row">
                    <Field label="Reminder button text" optional>
                      <input
                        value={followUp.buttonLabel}
                        onChange={(event) =>
                          setFollowUps((current) => current.map((f, i) => (i === index ? { ...f, buttonLabel: event.target.value } : f)))}
                        maxLength={80}
                        placeholder="Claim the offer"
                      />
                    </Field>
                    <Field label="Reminder button link" optional={!followUp.buttonLabel.trim()}>
                      <input
                        value={followUp.url}
                        onChange={(event) =>
                          setFollowUps((current) => current.map((f, i) => (i === index ? { ...f, url: event.target.value } : f)))}
                        placeholder="https://your-site.com/offer"
                        inputMode="url"
                      />
                    </Field>
                  </div>
                </fieldset>
              ))}
              <FieldError message={fieldError("followUps")} />
              {followUps.length < 2 && (
                <div className="builder-add-row">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setFollowUps((current) => [...current, { delayMinutes: "1440", text: "", buttonLabel: "", url: "" }])}
                  >
                    <Plus size={16} /> Add a reminder message
                  </button>
                  <p>Up to two.</p>
                </div>
              )}
            </StepGroup>
          )}
        </WizardStep>

        {triggerType !== "comment" && (
          <WizardStep
            hidden={isStepHidden("email")}
            title="Ask for their email?"
            optional
            description="After it replies, Linkar can ask for an email address and save it to Contacts."
          >
            <ToggleRow
              label="Ask for the person’s email after replying"
              checked={emailCaptureEnabled}
              onChange={setEmailCaptureEnabled}
            />
            {emailCaptureEnabled && (
              <>
                <p className="builder-note">
                  Linkar checks the reply looks like a real address and asks again up to two times. If someone already
                  sent an email in their first message, it’s saved straight away.
                </p>
                <Field label="Question asking for their email">
                  <textarea
                    value={emailPrompt}
                    onChange={(event) => setEmailPrompt(event.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="What’s the best email to send it to?"
                  />
                </Field>
                <Field label="Thank-you message" hint="Emails are saved to Contacts. You can export them as a CSV from there any time.">
                  <textarea
                    value={emailConfirmation}
                    onChange={(event) => setEmailConfirmation(event.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="You’re in! ✅ Check your inbox."
                  />
                </Field>
                <FieldError message={fieldError("email")} />
                <Field label="If their reply isn’t an email" optional>
                  <textarea
                    value={emailRetry}
                    onChange={(event) => setEmailRetry(event.target.value)}
                    rows={2}
                    maxLength={500}
                    placeholder="Hmm, that doesn’t look like an email. Could you check it?"
                  />
                </Field>

                <StepGroup title="Email them something right away?">
                  <ToggleRow
                    label="Send an email as soon as they share their address"
                    hint="Sent from your workspace’s support address."
                    checked={deliveryEnabled}
                    onChange={setDeliveryEnabled}
                  />
                  {deliveryEnabled && (
                    <>
                      <Field label="Email subject">
                        <input
                          value={deliverySubject}
                          onChange={(event) => setDeliverySubject(event.target.value)}
                          maxLength={200}
                          placeholder="Here’s your guide 🎁"
                        />
                      </Field>
                      <Field label="Email message">
                        <textarea
                          value={deliveryMessage}
                          onChange={(event) => setDeliveryMessage(event.target.value)}
                          rows={3}
                          maxLength={1000}
                          placeholder="Thanks for subscribing! Your guide is right here."
                        />
                      </Field>
                      <div className="builder-field-row">
                        <Field label="Link in the email" optional>
                          <input
                            value={deliveryLinkUrl}
                            onChange={(event) => setDeliveryLinkUrl(event.target.value)}
                            placeholder="https://your-site.com/guide.pdf"
                            inputMode="url"
                          />
                        </Field>
                        <Field label="Link text" optional>
                          <input
                            value={deliveryLinkLabel}
                            onChange={(event) => setDeliveryLinkLabel(event.target.value)}
                            maxLength={80}
                            placeholder="Download the guide"
                          />
                        </Field>
                      </div>
                      <FieldError message={fieldError("delivery")} />
                    </>
                  )}
                </StepGroup>

                <Disclosure
                  summary="Extra questions and other apps"
                  initiallyOpen={captureFields.length > 0 || Boolean(notifyUrl.trim()) || Boolean(exitText.trim())}
                >
                  <StepGroup
                    title="Extra questions"
                    description="Asked after their email, up to five. Answers are saved with the contact."
                  >
                    {captureFields.map((field, index) => (
                      <fieldset className="message-editor" key={field.id}>
                        <legend>Question {index + 1}</legend>
                        <button
                          type="button"
                          className="icon-button message-editor-remove"
                          aria-label={`Remove question ${index + 1}`}
                          onClick={() => setCaptureFields((current) => current.filter((_, i) => i !== index))}
                        >
                          <Trash2 size={16} />
                        </button>
                        <Field label="Question">
                          <input
                            value={field.question}
                            onChange={(event) =>
                              setCaptureFields((current) => current.map((f, i) => (i === index ? { ...f, question: event.target.value } : f)))
                            }
                            maxLength={300}
                            placeholder="e.g. What’s your name?"
                          />
                        </Field>
                        <div className="builder-field-row">
                          <Field label="Answer type">
                            <select
                              value={field.kind}
                              onChange={(event) =>
                                setCaptureFields((current) => current.map((f, i) => (i === index ? { ...f, kind: event.target.value as BuilderField["kind"] } : f)))}
                            >
                              <option value="text">Anything</option>
                              <option value="email">Email address</option>
                              <option value="phone">Phone number</option>
                              <option value="number">Number</option>
                            </select>
                          </Field>
                          <Field label="Words that end the questions" optional hint="e.g. no, not now">
                            <input
                              value={field.exitKeywords}
                              onChange={(event) =>
                                setCaptureFields((current) => current.map((f, i) => (i === index ? { ...f, exitKeywords: event.target.value } : f)))}
                            />
                          </Field>
                        </div>
                      </fieldset>
                    ))}
                    {captureFields.length < 5 && (
                      <div className="builder-add-row">
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => setCaptureFields((current) => [...current, { id: `field-${Date.now()}`, question: "", kind: "text", exitKeywords: "" }])}
                        >
                          <Plus size={16} /> Add question
                        </button>
                      </div>
                    )}
                    {captureFields.some((field) => parseKeywords(field.exitKeywords).length > 0) && (
                      <Field label="Message when they stop" hint="The rest of the questions are skipped. Anything they already answered is kept.">
                        <textarea
                          value={exitText}
                          onChange={(event) => setExitText(event.target.value)}
                          rows={2}
                          maxLength={500}
                          placeholder="No problem! Thanks for your time."
                        />
                      </Field>
                    )}
                  </StepGroup>
                  <Field
                    label="Send new leads to another app"
                    optional
                    hint="For tools like Zapier. Linkar sends each new email, the automation name and the time to this address."
                  >
                    <input
                      value={notifyUrl}
                      onChange={(event) => setNotifyUrl(event.target.value)}
                      placeholder="https://hooks.zapier.com/…"
                      inputMode="url"
                    />
                  </Field>
                </Disclosure>
              </>
            )}
          </WizardStep>
        )}

        <WizardStep
          hidden={isStepHidden("guardrails")}
          title="Any limits on when or how often?"
          optional
          description="Most automations don’t need these. Leave them empty to run all the time."
        >
          <Field label="Daily limit" optional className="is-short" hint="The most people it replies to in a day. After that it pauses until tomorrow.">
            <input
              type="number"
              min={1}
              max={1000}
              value={dailyLimit}
              onChange={(event) => setDailyLimit(event.target.value)}
              placeholder="No limit"
            />
          </Field>
          <div className="builder-field-row">
            <Field label="Run from" optional>
              <input
                type="datetime-local"
                value={scheduleStart}
                onChange={(event) => setScheduleStart(event.target.value)}
              />
            </Field>
            <Field label="Run until" optional>
              <input
                type="datetime-local"
                value={scheduleEnd}
                onChange={(event) => setScheduleEnd(event.target.value)}
              />
            </Field>
          </div>
          <p className="builder-note">Anything outside these dates is ignored. Handy for launches and limited offers.</p>
          <FieldError message={fieldError("schedule")} />
          <Disclosure summary="If another automation also matches" initiallyOpen={priority.trim() !== "" && priority.trim() !== "0"}>
            <AutomationPriorityField value={priority} onChange={setPriority} />
          </Disclosure>
        </WizardStep>

        <WizardStep
          hidden={isStepHidden("review")}
          title="Review and turn on"
          description="Here’s what will happen. Go back to any step to change it."
          className="review-step"
        >
          <ReviewStory title={<>“{name.trim() || "Untitled"}” on {channelPhrase(channel, isFacebook ? selectedPage?.pageName : connection?.username)}</>}>
            <ReviewBeat icon={<MessageCircle size={17} />}>
              <p>{triggerBeat}</p>
            </ReviewBeat>
            <ReviewBeat icon={<Send size={17} />}>
              <p>{actionLead}</p>
              <div className="review-quotes">{actions.map(reviewMessage)}</div>
            </ReviewBeat>
            {triggerType !== "comment" && emailCaptureEnabled && (
              <ReviewBeat icon={<Mail size={17} />}>
                <p>
                  Then it asks for their email and saves it to Contacts.
                  {deliveryEnabled && deliverySubject.trim() ? ` It emails them “${deliverySubject.trim()}” straight away.` : ""}
                </p>
              </ReviewBeat>
            )}
            {reminderBeat && (
              <ReviewBeat icon={<Send size={17} />}>
                <p>{reminderBeat}</p>
              </ReviewBeat>
            )}
            <ReviewBeat icon={<CalendarClock size={17} />}>
              {limitsSentences({ dailyLimit, scheduleStart, scheduleEnd, priority, oncePerPerson: triggerType === "comment" && replyOncePerUser, noun: "replies" })
                .map((sentence) => <p key={sentence}>{sentence}</p>)}
            </ReviewBeat>
          </ReviewStory>
          {hasPlaceholderLinks && (
            <p className="builder-callout is-warning" role="status">
              <AlertTriangle size={16} aria-hidden />
              <span>A link here still points at example.com. Swap in your own before this goes live, or the people who reply will get a dead link.</span>
            </p>
          )}
          <p className="builder-note">Save draft keeps it off. Save and turn on starts replying straight away.</p>
        </WizardStep>

        <BuilderFooter
          notice={notice}
          status={<SaveState dirty={dirty} saved={Boolean(savedAutomationId)} />}
          isFirst={clampedStep === 0}
          isLast={clampedStep === wizardSteps.length - 1}
          pendingIntent={pendingIntent}
          activateType="submit"
          onBack={() => goToStep(clampedStep - 1)}
          onNext={goToNextStep}
          onSaveDraft={() => void save("draft")}
          onPreview={() => { errors.clear(); setMobilePreviewOpen(true); }}
          previewOpen={mobilePreviewOpen}
        />
      </div>

      <PreviewPanel
        open={mobilePreviewOpen}
        onClose={() => setMobilePreviewOpen(false)}
        panelRef={previewRef}
        closeRef={previewCloseRef}
        hint="Updates as you type. Nothing is sent."
      >
        {facebookPageId ? (
          <FacebookPagePreview
            pageName={selectedPage?.pageName ?? "Your Page"}
            pageAvatarUrl={selectedPage?.avatarUrl}
            posterName="Your brand"
            postBody=""
            commentAuthor="A follower"
            commentText={triggerMatch === "keyword" ? (keywordList[0] ? `“${keywordList[0]}”` : "any comment") : "any comment"}
            replyText={firstReplyText ?? "(reply not set)"}
          />
        ) : (
          <InstagramPreview
            view={previewView}
            onViewChange={setPreviewView}
            showPost={triggerType === "comment"}
            showComments={false}
            username={connection?.username ?? "yourbrand"}
            avatarUrl={connection?.avatarUrl}
            postImageUrl={previewThumb?.thumbnailUrl}
            postIsReel={previewThumb?.isReel}
            messages={dmMessages}
          />
        )}
      </PreviewPanel>
    </form>
  );
}

type MediaSource = "specific_media" | "all_media" | "next_media";

const defaultDefinitionV2: FlowDefinitionV2 = {
  version: 2,
  trigger: { type: "comment", source: "specific_media", mediaIds: [], mediaSnapshots: [], match: "keyword", keywords: [] },
  publicReplies: [""],
  openingMessage: { text: "", optInButtonLabel: "Get it" },
  followGate: { required: true, notFollowingMessage: "", recheckButtonLabel: "I followed" },
  delivery: { text: "", url: "", buttonLabel: "" },
};

const WIZARD_STEPS = ["Choose posts", "Comments", "First DM", "Send link", "Limits", "Review"] as const;
const STEP_PREVIEW_VIEW: PreviewView[] = ["post", "comments", "dm", "dm", "dm", "dm"];

function isLocalDeliveryUrl(url: URL): boolean {
  return url.protocol === "http:" && url.hostname === "localhost";
}

function looksLikeTwoLinksPastedTogether(url: string): boolean {
  return (url.match(/https?:\/\//gi)?.length ?? 0) > 1;
}

function AutomationBuilderV2({
  automationId,
  initialName = "",
  initialDefinition = defaultDefinitionV2,
  initialInstagramAccountId = "",
  initialMediaIds = [],
  initialPriority = 0,
  onSaved,
}: {
  automationId?: string;
  initialName?: string;
  initialDefinition?: FlowDefinitionV2;
  initialInstagramAccountId?: string;
  initialMediaIds?: string[];
  initialPriority?: number;
  onSaved?: (automation: unknown) => void;
}) {
  const [name, setName] = useState(initialName);
  const [instagramAccountId, setInstagramAccountId] = useState(initialInstagramAccountId);
  const [savedAutomationId, setSavedAutomationId] = useState(automationId);
  const [source, setSource] = useState<MediaSource>(initialDefinition.trigger.source);
  const [mediaIds, setMediaIds] = useState<string[]>(
    [...new Set([...initialDefinition.trigger.mediaIds, ...initialMediaIds])],
  );
  const [mediaSnapshots, setMediaSnapshots] = useState<MediaSnapshot[]>(initialDefinition.trigger.mediaSnapshots);
  const [match, setMatch] = useState<"keyword" | "any">(initialDefinition.trigger.match);
  const [keywords, setKeywords] = useState(commaSeparated(initialDefinition.trigger.keywords));
  const [publicReplies, setPublicReplies] = useState<string[]>(
    initialDefinition.publicReplies.length > 0 ? initialDefinition.publicReplies : [""],
  );
  const [openingText, setOpeningText] = useState(initialDefinition.openingMessage.text);
  const [optInButtonLabel, setOptInButtonLabel] = useState(initialDefinition.openingMessage.optInButtonLabel);
  const [notFollowingMessage, setNotFollowingMessage] = useState(initialDefinition.followGate.notFollowingMessage);
  const [recheckButtonLabel, setRecheckButtonLabel] = useState(initialDefinition.followGate.recheckButtonLabel);
  const [followGateRequired, setFollowGateRequired] = useState(initialDefinition.followGate.required);
  const [openingVariants, setOpeningVariants] = useState((initialDefinition.openingMessage.textVariants ?? []).join("\n"));
  const [deliveryVariants, setDeliveryVariants] = useState((initialDefinition.delivery.textVariants ?? []).join("\n"));
  const [scheduleStart, setScheduleStart] = useState(isoToLocalInput(initialDefinition.schedule?.startsAt));
  const [scheduleEnd, setScheduleEnd] = useState(isoToLocalInput(initialDefinition.schedule?.endsAt));
  const [campaignDailyLimit, setCampaignDailyLimit] = useState(initialDefinition.dailySendLimit ? String(initialDefinition.dailySendLimit) : "");
  const [priority, setPriority] = useState(String(initialPriority));
  const [deliveryText, setDeliveryText] = useState(initialDefinition.delivery.text);
  const [deliveryUrl, setDeliveryUrl] = useState(initialDefinition.delivery.url);
  const [deliveryButtonLabel, setDeliveryButtonLabel] = useState(initialDefinition.delivery.buttonLabel ?? "");
  const [pendingIntent, setPendingIntent] = useState<"draft" | "activate" | null>(null);
  const [savedIntent, setSavedIntent] = useState<"draft" | "activate" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const errors = useStepErrors(rootRef);
  const { error, fieldError } = errors;
  const [activeStep, setActiveStep] = useState(0);
  const [highestUnlockedStep, setHighestUnlockedStep] = useState(automationId ? WIZARD_STEPS.length - 1 : 0);
  const [previewView, setPreviewView] = useState<PreviewView>("post");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const previewRef = useRef<HTMLElement>(null);
  const previewCloseRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(previewRef, {
    active: mobilePreviewOpen,
    onEscape: () => setMobilePreviewOpen(false),
    initialFocusRef: previewCloseRef,
  });
  const { connections } = useInstagramConnections();
  const selectedInstagramAccountId = instagramAccountId || defaultInstagramAccountId(connections);
  const connection = connections.find((item) => item.igUserId === selectedInstagramAccountId)
    ?? connections[0]
    ?? null;
  const [mediaIndex, setMediaIndex] = useState<Record<string, { thumbnailUrl?: string; isReel?: boolean }>>({});
  const onMediaIndexChange = useCallback(
    (index: Record<string, { thumbnailUrl?: string; isReel?: boolean }>) => setMediaIndex(index),
    [],
  );

  function changeSource(value: MediaSource) {
    setSource(value);
    if (value !== "specific_media") {
      setMediaIds([]);
      setMediaSnapshots([]);
    }
  }

  function updateReply(index: number, value: string) {
    setPublicReplies((current) => current.map((reply, replyIndex) => (replyIndex === index ? value : reply)));
  }

  function addReply() {
    setPublicReplies((current) => (current.length >= MAX_PUBLIC_REPLIES ? current : [...current, ""]));
  }

  function removeReply(index: number) {
    setPublicReplies((current) => current.filter((_, replyIndex) => replyIndex !== index));
  }

  function buildDefinition(): FlowDefinitionV2 {
    const schedule: FlowDefinitionV2["schedule"] = {};
    const startsAt = localInputToIso(scheduleStart);
    const endsAt = localInputToIso(scheduleEnd);
    if (startsAt) schedule.startsAt = startsAt;
    if (endsAt) schedule.endsAt = endsAt;
    const parsedLimit = Number.parseInt(campaignDailyLimit, 10);
    const splitVariants = (value: string) =>
      value.split("\n").map((variant) => variant.trim()).filter(Boolean);

    return {
      version: 2,
      trigger: {
        type: "comment",
        source,
        mediaIds: source === "specific_media" ? mediaIds : [],
        mediaSnapshots: source === "specific_media" ? mediaSnapshots : [],
        match,
        keywords: match === "keyword" ? parseKeywords(keywords) : [],
      },
      publicReplies: publicReplies.map((reply) => reply.trim()).filter(Boolean),
      openingMessage: {
        text: openingText.trim(),
        ...(splitVariants(openingVariants).length > 0 ? { textVariants: splitVariants(openingVariants) } : {}),
        optInButtonLabel: optInButtonLabel.trim(),
      },
      followGate: {
        required: followGateRequired,
        notFollowingMessage: followGateRequired ? notFollowingMessage.trim() : "",
        recheckButtonLabel: followGateRequired ? recheckButtonLabel.trim() : "",
      },
      delivery: {
        text: deliveryText.trim(),
        ...(splitVariants(deliveryVariants).length > 0 ? { textVariants: splitVariants(deliveryVariants) } : {}),
        url: deliveryUrl.trim(),
        ...(deliveryButtonLabel.trim() ? { buttonLabel: deliveryButtonLabel.trim() } : {}),
      },
      ...(Number.isFinite(parsedLimit) && parsedLimit > 0 ? { dailySendLimit: parsedLimit } : {}),
      ...(startsAt || endsAt ? { schedule } : {}),
    };
  }

  function validateStep(step: number): StepIssue | null {
    if (step === 0) {
      if (!name.trim()) return { field: "name", message: "Give this automation a name first." };
      if (source === "specific_media" && mediaIds.length === 0) return { field: "media", message: "Select at least one post or Reel to watch." };
    }
    if (step === 1) {
      if (match === "keyword" && parseKeywords(keywords).length === 0) return { field: "keywords", message: "Add at least one keyword." };
      if (publicReplies.every((reply) => !reply.trim())) return { field: "replies", message: "Write at least one reply." };
      if (publicReplies.map((reply) => reply.trim()).filter(Boolean).length > MAX_PUBLIC_REPLIES) {
        return { field: "replies", message: `Use up to ${MAX_PUBLIC_REPLIES} replies.` };
      }
    }
    if (step === 2) {
      if (!openingText.trim()) return { field: "opening", message: "Write the first message." };
      if (!optInButtonLabel.trim()) return { field: "optIn", message: "Add the text for the button they tap." };
      if (optInButtonLabel.trim().length > QUICK_REPLY_LABEL_MAX_LENGTH) return { field: "optIn", message: "Button text must be 20 characters or fewer." };
      if (recheckButtonLabel.trim().length > QUICK_REPLY_LABEL_MAX_LENGTH) return { field: "recheck", message: "Button text must be 20 characters or fewer." };
      if (followGateRequired && !notFollowingMessage.trim()) return { field: "notFollowing", message: "Write the message for people who don’t follow you yet, or turn off the follower check." };
      if (followGateRequired && !recheckButtonLabel.trim()) return { field: "recheck", message: "Add the text for the button they tap after following." };
      if (openingVariants.split("\n").filter((variant) => variant.trim()).length > 5) return { field: "openingVariants", message: "Use up to 5 other versions of the first message." };
    }
    if (step === 3) {
      if (!deliveryText.trim()) return { field: "deliveryText", message: "Write the message to send with the link." };
      if (!deliveryUrl.trim()) return { field: "deliveryUrl", message: "Add the link to send." };
      if (deliveryVariants.split("\n").filter((variant) => variant.trim()).length > 5) return { field: "deliveryVariants", message: "Use up to 5 other versions of this message." };
      try {
        const url = new URL(deliveryUrl.trim());
        if (url.protocol !== "https:" && !isLocalDeliveryUrl(url)) return { field: "deliveryUrl", message: "The link must start with https://" };
      } catch {
        return { field: "deliveryUrl", message: "Enter a full link, starting with https://" };
      }
    }
    if (step === 4) {
      const startsAt = localInputToIso(scheduleStart);
      const endsAt = localInputToIso(scheduleEnd);
      if (scheduleStart && !startsAt) return { field: "schedule", message: "Enter a valid start date and time." };
      if (scheduleEnd && !endsAt) return { field: "schedule", message: "Enter a valid end date and time." };
      if (startsAt && endsAt && startsAt > endsAt) return { field: "schedule", message: "The start must come before the end of the schedule." };
    }
    return null;
  }

  function validate(): string | null {
    if (!name.trim()) return "Give this automation a name first.";
    if (source === "specific_media" && mediaIds.length === 0) return "Select at least one post or Reel to watch.";
    if (match === "keyword" && parseKeywords(keywords).length === 0) return "Add at least one keyword.";
    if (publicReplies.map((reply) => reply.trim()).filter(Boolean).length > MAX_PUBLIC_REPLIES) {
      return `Use up to ${MAX_PUBLIC_REPLIES} replies.`;
    }
    if (optInButtonLabel.trim().length > QUICK_REPLY_LABEL_MAX_LENGTH) return "Button text must be 20 characters or fewer.";
    if (recheckButtonLabel.trim().length > QUICK_REPLY_LABEL_MAX_LENGTH) return "Button text must be 20 characters or fewer.";
    if (followGateRequired && !notFollowingMessage.trim()) return "Write the message for people who don’t follow you yet, or turn off the follower check.";
    if (!deliveryUrl.trim()) return "Add the link to send.";
    const startsAt = localInputToIso(scheduleStart);
    const endsAt = localInputToIso(scheduleEnd);
    if (scheduleStart && !startsAt) return "Enter a valid start date and time.";
    if (scheduleEnd && !endsAt) return "Enter a valid end date and time.";
    if (startsAt && endsAt && startsAt > endsAt) return "The start must come before the end of the schedule.";
    if (openingVariants.split("\n").filter((variant) => variant.trim()).length > 5) return "Use up to 5 other versions of the first message.";
    if (deliveryVariants.split("\n").filter((variant) => variant.trim()).length > 5) return "Use up to 5 other versions of this message.";
    try {
      const url = new URL(deliveryUrl.trim());
      if (url.protocol !== "https:" && !isLocalDeliveryUrl(url)) return "The link must start with https://";
    } catch {
      return "Enter a full link, starting with https://";
    }
    return null;
  }

  /** Everything a save persists, for unsaved-changes tracking. Media is
   * compared by id: the picker hydrates snapshots after mount, which is not
   * an edit. */
  function dirtySnapshot(): string {
    const definition = buildDefinition();
    return JSON.stringify({
      name,
      instagramAccountId,
      priority,
      definition: { ...definition, trigger: { ...definition.trigger, mediaSnapshots: [] } },
    });
  }
  const [savedSnapshot, setSavedSnapshot] = useState(dirtySnapshot);
  const dirty = dirtySnapshot() !== savedSnapshot;
  useUnsavedChangesGuard(dirty);

  async function save(intent: "draft" | "activate") {
    errors.clear();
    const validationError = validate();
    if (validationError) {
      errors.fail(validationError);
      return;
    }
    setPendingIntent(intent);
    try {
      const parsedPriority = Number.parseInt(priority, 10);
      const snapshot = dirtySnapshot();
      const response = await fetch(savedAutomationId ? `/api/automations/${savedAutomationId}` : "/api/automations", {
        method: savedAutomationId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "INSTAGRAM",
          name,
          status: intent === "activate" ? "ACTIVE" : "DRAFT",
          definition: buildDefinition(),
          priority: Number.isFinite(parsedPriority) ? parsedPriority : 0,
          instagramAccountId: selectedInstagramAccountId || null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: { id: string }; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not save this automation");
      if (!savedAutomationId) adoptEditUrl(payload.data.id);
      setSavedAutomationId(payload.data.id);
      setSavedSnapshot(snapshot);

      onSaved?.(payload.data);
      setSavedIntent(intent);
    } catch (caught) {
      errors.fail(toReadableApiError(caught instanceof Error ? caught.message : caught, "Could not save this automation"));
    } finally {
      setPendingIntent(null);
    }
  }

  const keywordList = parseKeywords(keywords);
  const nonEmptyReplies = publicReplies.map((reply) => reply.trim()).filter(Boolean);
  const sourceSummary =
    source === "specific_media"
      ? mediaIds.length > 0
        ? `${mediaIds.length} selected post${mediaIds.length === 1 ? "" : "s"}`
        : "no post selected yet"
      : source === "all_media"
        ? "all of your posts"
        : "the next post you publish";

  // Same rule as the classic builder: every step is reachable, and a jump
  // ahead stops at the first unfinished step with its problem shown inline.
  function goToStep(next: number) {
    const clamped = Math.max(0, Math.min(WIZARD_STEPS.length - 1, next));
    if (clamped > activeStep) {
      for (let i = activeStep; i < clamped; i++) {
        const issue = validateStep(i);
        if (issue) {
          setHighestUnlockedStep((current) => Math.max(current, i));
          setActiveStep(i);
          setPreviewView(STEP_PREVIEW_VIEW[i]);
          errors.showIssue(issue, true);
          return;
        }
      }
      setHighestUnlockedStep((current) => Math.max(current, clamped));
    }
    errors.clear();
    setActiveStep(clamped);
    setPreviewView(STEP_PREVIEW_VIEW[clamped]);
  }

  function goToNextStep() {
    const issue = validateStep(activeStep);
    if (issue) {
      errors.showIssue(issue, true);
      return;
    }
    const next = Math.min(WIZARD_STEPS.length - 1, activeStep + 1);
    errors.clear();
    setHighestUnlockedStep((current) => Math.max(current, next));
    setActiveStep(next);
    setPreviewView(STEP_PREVIEW_VIEW[next]);
  }

  const dmMessages: DmBubble[] = [];
  if (openingText.trim()) {
    dmMessages.push({
      id: "opening",
      from: "bot",
      text: openingText,
      actions: [optInButtonLabel.trim() || "Get it"],
    });
    dmMessages.push({ id: "opt-in", from: "tap", button: optInButtonLabel.trim() || "Get it" });
  }
  if (followGateRequired && notFollowingMessage.trim()) {
    dmMessages.push({
      id: "not-following",
      from: "bot",
      text: notFollowingMessage,
      actions: ["Visit Profile", recheckButtonLabel.trim() || "I followed"],
    });
  }
  if (deliveryText.trim()) {
    dmMessages.push({
      id: "delivery",
      from: "bot",
      text: deliveryText,
      ...(deliveryButtonLabel.trim() ? { actions: [deliveryButtonLabel.trim()] } : {}),
    });
  }

  const notice = error && !errors.errorField
    ? <ActionNotice tone="error" message={error} onDismiss={errors.clear} />
    : !error && savedIntent
      ? (
        <ActionNotice
          tone="success"
          message={savedIntent === "activate" ? "Saved and turned on." : "Saved to your workspace."}
          onDismiss={() => setSavedIntent(null)}
        />
      )
      : null;

  return (
    <div ref={rootRef} className="builder-layout">
      <div className="builder-main">
        <PageHeader
          className="builder-header"
          title={savedAutomationId ? "Edit comment reply" : "Send a link after someone follows you"}
          description="Reply to a comment, check they follow you, then send your link in a DM."
          tabs={<BuilderStepper steps={WIZARD_STEPS.map((label) => ({ label }))} active={activeStep} unlocked={highestUnlockedStep} onSelect={goToStep} />}
        />

        <WizardStep
          hidden={activeStep !== 0}
          title="Which posts should it watch?"
          description="Linkar watches the comments on these posts."
        >
          <ChoiceCards
            legend="Posts to watch"
            name="campaign-source"
            value={source}
            onChange={changeSource}
            options={[
              { value: "specific_media", label: "Posts I choose", description: "Pick posts or Reels below" },
              { value: "all_media", label: "All my posts", description: "Every post, old and new" },
              { value: "next_media", label: "My next post", description: "Whatever you publish next" },
            ]}
          />
          {source === "specific_media" && (
            <div className="builder-field">
              <MediaPicker
                selectedIds={mediaIds}
                initialSnapshots={mediaSnapshots}
                onIndexChange={onMediaIndexChange}
                onChange={(ids, snapshots) => {
                  setMediaIds(ids);
                  setMediaSnapshots(snapshots);
                }}
              />
              <FieldError message={fieldError("media")} />
            </div>
          )}
          {connections.length > 1 && (
            <Field label="Instagram account">
              <select
                value={selectedInstagramAccountId}
                onChange={(event) => setInstagramAccountId(event.target.value)}
              >
                <option value="" disabled>Select a connected account</option>
                {connections.map((item) => (
                  <option key={item.igUserId || item.username} value={item.igUserId}>@{item.username}</option>
                ))}
              </select>
            </Field>
          )}
          <StepGroup title="Name it">
            <Field label="Automation name" hint="Only you see this. It helps you find it later." error={fieldError("name")}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Reel giveaway link"
                maxLength={120}
              />
            </Field>
          </StepGroup>
        </WizardStep>

        <WizardStep
          hidden={activeStep !== 1}
          title="Which comments should it answer?"
          description="Choose the words that start it, then write the reply that appears under their comment."
        >
          <Field label="Which comments count?">
            <select value={match} onChange={(event) => setMatch(event.target.value as "keyword" | "any")}>
              <option value="keyword">Only ones with certain words</option>
              <option value="any">Every comment</option>
            </select>
          </Field>
          {match === "keyword" && (
            <KeywordInput
              label="Words to look for"
              value={keywords}
              onChange={setKeywords}
              placeholder="link, guide, price"
              hint="Press Enter after each word. Capital letters don’t matter."
              error={fieldError("keywords")}
            />
          )}

          <StepGroup
            title="What should it reply in the comments?"
            description="Everyone can see this reply, so keep it short. It tells them to check their DMs."
          >
            {publicReplies.map((reply, index) => (
              <div className="reply-version" key={index}>
                <Field label={`Reply ${index + 1}`}>
                  <textarea
                    value={reply}
                    onChange={(event) => updateReply(index, event.target.value)}
                    rows={2}
                    maxLength={1_000}
                    placeholder={index === 0 ? "Sent! Check your DMs ✨" : "Another way to say it"}
                  />
                </Field>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove reply ${index + 1}`}
                  onClick={() => removeReply(index)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <FieldError message={fieldError("replies")} />
            <div className="builder-add-row">
              <button
                type="button"
                className="button button-secondary"
                onClick={addReply}
                disabled={publicReplies.length >= MAX_PUBLIC_REPLIES}
              >
                <Plus size={16} /> Add another version
              </button>
              <p>Up to five. Linkar takes turns so the same reply doesn’t repeat.</p>
            </div>
          </StepGroup>
        </WizardStep>

        <WizardStep
          hidden={activeStep !== 2}
          title="What should the first DM say?"
          description="Instagram only lets you send a link after they tap a button, so this message asks them to."
        >
          <Field label="First message" error={fieldError("opening")}>
            <textarea
              value={openingText}
              onChange={(event) => setOpeningText(event.target.value)}
              rows={3}
              maxLength={1_000}
              placeholder="Hey! Tap below and I’ll send you the link 👇"
            />
          </Field>
          <Field
            label="Button they tap"
            className="is-short"
            hint={`${optInButtonLabel.length} of ${QUICK_REPLY_LABEL_MAX_LENGTH} characters`}
            error={fieldError("optIn")}
          >
            <input
              value={optInButtonLabel}
              onChange={(event) => setOptInButtonLabel(event.target.value)}
              maxLength={QUICK_REPLY_LABEL_MAX_LENGTH}
              placeholder="Get it"
            />
          </Field>
          <Disclosure summary="Other ways to say the first message" initiallyOpen={Boolean(openingVariants.trim())}>
            <Field
              label="Other versions of the first message"
              optional
              hint="One per line. Each person gets one at random; the button stays the same."
              error={fieldError("openingVariants")}
            >
              <textarea
                value={openingVariants}
                onChange={(event) => setOpeningVariants(event.target.value)}
                rows={3}
              />
            </Field>
          </Disclosure>

          <StepGroup title="Only send the link to followers?">
            <ToggleRow
              role="switch"
              label="Check whether they follow you"
              hint={followGateRequired
                ? "On. People who don’t follow you yet are asked to follow first."
                : "Off. The link goes out as soon as they tap the button."}
              checked={followGateRequired}
              onChange={setFollowGateRequired}
            />
            {followGateRequired && (
              <FollowGateFields
                notFollowingMessage={notFollowingMessage}
                onNotFollowingMessageChange={setNotFollowingMessage}
                recheckButtonLabel={recheckButtonLabel}
                onRecheckButtonLabelChange={setRecheckButtonLabel}
                notFollowingError={fieldError("notFollowing")}
                recheckError={fieldError("recheck")}
              />
            )}
          </StepGroup>
        </WizardStep>

        <WizardStep
          hidden={activeStep !== 3}
          title="What link should it send?"
          description={followGateRequired ? "Sent once they tap the button and follow you." : "Sent as soon as they tap the button."}
        >
          <Field label="Message to send with the link" error={fieldError("deliveryText")}>
            <textarea
              value={deliveryText}
              onChange={(event) => setDeliveryText(event.target.value)}
              rows={2}
              maxLength={1_000}
              placeholder="Here’s your link! Enjoy 🎉"
            />
          </Field>
          <div className="builder-field-row">
            <Field label="Link to send" hint="Must start with https://" error={fieldError("deliveryUrl")}>
              <input
                value={deliveryUrl}
                onChange={(event) => setDeliveryUrl(event.target.value)}
                placeholder="https://your-site.com/prize"
                inputMode="url"
              />
            </Field>
            <Field label="Link button text" optional className="is-short">
              <input
                value={deliveryButtonLabel}
                onChange={(event) => setDeliveryButtonLabel(event.target.value)}
                maxLength={80}
                placeholder="Open link"
              />
            </Field>
          </div>
          {looksLikeTwoLinksPastedTogether(deliveryUrl) && (
            <p className="builder-callout is-warning" role="status">
              <AlertTriangle size={16} aria-hidden />
              <span>This looks like two links pasted together. Double-check it before saving.</span>
            </p>
          )}
          <Disclosure summary="Other ways to say this message" initiallyOpen={Boolean(deliveryVariants.trim())}>
            <Field
              label="Other versions of the link message"
              optional
              hint="One per line. Each person gets one at random."
              error={fieldError("deliveryVariants")}
            >
              <textarea
                value={deliveryVariants}
                onChange={(event) => setDeliveryVariants(event.target.value)}
                rows={3}
              />
            </Field>
          </Disclosure>
        </WizardStep>

        <WizardStep
          hidden={activeStep !== 4}
          title="Any limits on when or how often?"
          optional
          description="Most automations don’t need these. Leave them empty to run all the time."
        >
          <Field label="Daily limit" optional className="is-short" hint="The most links it sends in a day. After that it pauses until tomorrow.">
            <input
              type="number"
              min={1}
              max={1000}
              value={campaignDailyLimit}
              onChange={(event) => setCampaignDailyLimit(event.target.value)}
              placeholder="No limit"
            />
          </Field>
          <div className="builder-field-row">
            <Field label="Run from" optional>
              <input
                type="datetime-local"
                value={scheduleStart}
                onChange={(event) => setScheduleStart(event.target.value)}
              />
            </Field>
            <Field label="Run until" optional>
              <input
                type="datetime-local"
                value={scheduleEnd}
                onChange={(event) => setScheduleEnd(event.target.value)}
              />
            </Field>
          </div>
          <p className="builder-note">Comments outside these dates are ignored. Handy for launches and limited drops.</p>
          <FieldError message={fieldError("schedule")} />
          <Disclosure summary="If another automation also matches" initiallyOpen={priority.trim() !== "" && priority.trim() !== "0"}>
            <AutomationPriorityField value={priority} onChange={setPriority} />
          </Disclosure>
        </WizardStep>

        <WizardStep
          hidden={activeStep !== 5}
          title="Review and turn on"
          description="Here’s what will happen. Go back to any step to change it."
          className="review-step"
        >
          <ReviewStory title={<>“{name.trim() || "Untitled"}” on {channelPhrase("INSTAGRAM", connection?.username)}</>}>
            <ReviewBeat icon={<Film size={17} />}>
              <p>Linkar watches {sourceSummary}.</p>
            </ReviewBeat>
            <ReviewBeat icon={<MessageCircle size={17} />}>
              <p>
                When {match === "keyword" ? (keywordList.length ? `someone comments ${quotedList(keywordList)}` : "someone comments a chosen word") : "anyone comments"},
                {nonEmptyReplies.length
                  ? ` it replies under their comment${nonEmptyReplies.length > 1 ? `, taking turns between ${nonEmptyReplies.length} versions like` : ""}:`
                  : " it doesn’t reply in the comments."}
              </p>
              {nonEmptyReplies[0] ? <div className="review-quotes"><ReviewQuote text={nonEmptyReplies[0]} /></div> : null}
            </ReviewBeat>
            <ReviewBeat icon={<Send size={17} />}>
              <p>Then it sends them a DM with a button to tap:</p>
              <div className="review-quotes"><ReviewQuote text={openingText.trim() || "(no first message yet)"} button={optInButtonLabel.trim() || undefined} /></div>
            </ReviewBeat>
            <ReviewBeat icon={<UserCheck size={17} />}>
              {followGateRequired ? (
                <>
                  <p>If they don’t follow you yet, it asks them to follow first:</p>
                  <div className="review-quotes"><ReviewQuote text={notFollowingMessage.trim() || "(no message yet)"} button={recheckButtonLabel.trim() || "add a label"} /></div>
                </>
              ) : (
                <p>It doesn’t check whether they follow you, so the link goes out after they tap.</p>
              )}
            </ReviewBeat>
            <ReviewBeat icon={<Link2 size={17} />}>
              <p>{followGateRequired ? "Once they follow you, it sends your link:" : "Then it sends your link:"}</p>
              <div className="review-quotes">
                <ReviewQuote
                  text={deliveryText.trim() || "(no message yet)"}
                  link={deliveryUrl ? <a href={deliveryUrl} target="_blank" rel="noreferrer" className="text-link">{deliveryUrl}</a> : "No link yet"}
                  button={deliveryButtonLabel.trim() || undefined}
                />
              </div>
            </ReviewBeat>
            <ReviewBeat icon={<CalendarClock size={17} />}>
              {limitsSentences({ dailyLimit: campaignDailyLimit, scheduleStart, scheduleEnd, priority, noun: "links" })
                .map((sentence) => <p key={sentence}>{sentence}</p>)}
            </ReviewBeat>
          </ReviewStory>
          <p className="builder-note">Save draft keeps it off. Save and turn on starts replying straight away.</p>
        </WizardStep>

        <BuilderFooter
          notice={notice}
          status={<SaveState dirty={dirty} saved={Boolean(savedAutomationId)} />}
          isFirst={activeStep === 0}
          isLast={activeStep === WIZARD_STEPS.length - 1}
          pendingIntent={pendingIntent}
          activateType="button"
          onBack={() => goToStep(activeStep - 1)}
          onNext={goToNextStep}
          onSaveDraft={() => void save("draft")}
          onActivate={() => void save("activate")}
          onPreview={() => { errors.clear(); setMobilePreviewOpen(true); }}
          previewOpen={mobilePreviewOpen}
        />
      </div>

      <PreviewPanel
        open={mobilePreviewOpen}
        onClose={() => setMobilePreviewOpen(false)}
        panelRef={previewRef}
        closeRef={previewCloseRef}
        hint="Updates as you type. Nothing is sent."
      >
        <InstagramPreview
          view={previewView}
          onViewChange={setPreviewView}
          username={connection?.username ?? "yourbrand"}
          avatarUrl={connection?.avatarUrl}
          postCaption={mediaSnapshots[0]?.caption}
          postImageUrl={mediaSnapshots[0] ? mediaIndex[mediaSnapshots[0].id]?.thumbnailUrl : undefined}
          postIsReel={mediaSnapshots[0]?.mediaProductType === "REELS"}
          triggerComment={match === "keyword" ? (keywordList[0] ? `“${keywordList[0]}”` : undefined) : "any comment"}
          commentReply={nonEmptyReplies[0]}
          messages={dmMessages}
        />
      </PreviewPanel>
    </div>
  );
}

export function AutomationBuilder({
  automationId,
  initialName,
  initialDefinition,
  initialInstagramAccountId,
  initialFacebookPageId,
  initialMediaIds,
  initialPriority,
  onSaved,
  variant,
}: AutomationBuilderProps & { variant?: "campaign" | "classic" }) {
  if (initialDefinition?.version === 1) {
    return (
      <AutomationBuilderV1
        automationId={automationId}
        initialName={initialName}
        initialDefinition={initialDefinition}
        initialInstagramAccountId={initialInstagramAccountId}
        initialFacebookPageId={initialFacebookPageId}
        initialMediaIds={initialMediaIds}
        initialPriority={initialPriority}
        onSaved={onSaved}
      />
    );
  }
  if (!initialDefinition && variant === "classic") {
    return (
      <AutomationBuilderV1
        automationId={automationId}
        initialName={initialName}
        initialInstagramAccountId={initialInstagramAccountId}
        initialFacebookPageId={initialFacebookPageId}
        initialMediaIds={initialMediaIds}
        initialPriority={initialPriority}
        onSaved={onSaved}
      />
    );
  }
  return (
    <AutomationBuilderV2
      automationId={automationId}
      initialName={initialName}
      initialDefinition={initialDefinition as FlowDefinitionV2 | undefined}
      initialInstagramAccountId={initialInstagramAccountId}
      initialMediaIds={initialMediaIds}
      initialPriority={initialPriority}
      onSaved={onSaved}
    />
  );
}
