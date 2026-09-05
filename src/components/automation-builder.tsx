"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleHelp,
  Eye,
  Film,
  Link2,
  Mail,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import type { FlowAction, FlowCondition, FlowDefinition, FlowDefinitionV1, FlowDefinitionV2, MediaSnapshot } from "@/src/lib/automation/types";
import { MediaPicker } from "./media-picker";
import { FollowGateFields } from "./follow-gate-fields";
import { InstagramPreview, type DmBubble, type PreviewView } from "./instagram-preview";
import { FacebookPagePreview } from "./facebook-page-preview";
import { getInstagramConnections, getFacebookPages, type FacebookPageSummary } from "@/src/lib/client/workspace-data";
import { ChannelSelector } from "./automation-builder/channel-selector";
import { CommentKeywordControls, type CommentKeywordMode } from "./automation-builder/trigger-section";
import { CommentConditionsSection } from "./automation-builder/comment-conditions-section";
import { PublicPageReplyVariants } from "./automation-builder/action-section";
import { AutomationPriorityField } from "./automation-builder/delivery-controls-section";
import { ChannelReviewItem } from "./automation-builder/review-section";
import { ActionNotice } from "./action-notice";
import { toReadableApiError } from "@/src/lib/validation-error";

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

type ConnectionSummary = { username: string; igUserId: string; avatarUrl?: string };

/** Every Instagram account connected to this workspace, for the account picker and previews. */
function useInstagramConnections(): ConnectionSummary[] {
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
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
              ...(connection.profilePictureUrl ? { avatarUrl: connection.profilePictureUrl } : {}),
            })),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return connections;
}

/** Every Facebook Page connected to this workspace, for the page picker and the
 * Facebook preview. Mirrors `useInstagramConnections` so the two channels
 * can be interchanged by the channel toggle. */
function useFacebookPages(): FacebookPageSummary[] {
  const [pages, setPages] = useState<FacebookPageSummary[]>([]);
  useEffect(() => {
    let active = true;
    getFacebookPages()
      .then((data) => {
        if (!active) return;
        setPages(data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return pages;
}

/** The workspace's first connected Instagram account, so the phone preview shows the real
 * handle, account ID and profile photo instead of placeholders. Degrades to null when nothing is connected. */
function useConnectedInstagram(): ConnectionSummary | null {
  return useInstagramConnections()[0] ?? null;
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
    { value: "send_text", label: "Send a DM", description: "Send a plain text message" },
    { value: "send_image", label: "Send an image", description: "Send a photo with a caption" },
    { value: "send_link", label: "Send a link", description: "Deliver a link in a DM" },
    { value: "send_button", label: "Send a button", description: "Deliver a tappable link" },
    { value: "quick_replies", label: "Quick replies", description: "A DM with tappable reply chips" },
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

function isoToLocalInput(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
  const [channel, setChannel] = useState<"INSTAGRAM" | "FACEBOOK">(
    initialFacebookPageId ? "FACEBOOK" : "INSTAGRAM",
  );
  const facebookPages = useFacebookPages();
  // Default the channel off; once a Facebook page is selected the preview +
  // pin all use Facebook. If both fields are set on the server, the API will
  // return 400 so we clear the other channel when the user picks one.
  const [facebookPageId, setFacebookPageId] = useState(
    initialFacebookPageId || "",
  );
  const [triggerType, setTriggerType] = useState<ClassicTriggerType>(initialDefinition.trigger.type);
  const [triggerMatch, setTriggerMatch] = useState<"keyword" | "any">(
    initialDefinition.trigger.type === "comment" || initialDefinition.trigger.type === "message"
      ? initialDefinition.trigger.match
      : "keyword",
  );
  const [keywords, setKeywords] = useState(
    initialDefinition.trigger.type === "comment" || initialDefinition.trigger.type === "message"
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
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [highestUnlockedStep, setHighestUnlockedStep] = useState(automationId ? 99 : 0);
  const [previewView, setPreviewView] = useState<PreviewView>(initialDefinition.trigger.type === "comment" ? "post" : "dm");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const connections = useInstagramConnections();
  const connection = connections[0] ?? null;
  // Classic flows reference media by pasted IDs; pull thumbnails so the phone
  // preview can render the real post. Display-only - never saved.
  const [mediaThumbs, setMediaThumbs] = useState<Record<string, { thumbnailUrl?: string; isReel?: boolean }>>({});
  useEffect(() => {
    if (triggerType !== "comment") return;
    let active = true;
    fetch("/api/meta/media")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data?: { id: string; thumbnailUrl?: string; mediaUrl?: string; mediaProductType?: string }[] } | null) => {
        if (!active || !payload?.data) return;
        const index: Record<string, { thumbnailUrl?: string; isReel?: boolean }> = {};
        for (const media of payload.data) {
          const thumbnailUrl = media.thumbnailUrl ?? media.mediaUrl;
          if (!thumbnailUrl && media.mediaProductType !== "REELS") continue;
          index[media.id] = {
            ...(thumbnailUrl ? { thumbnailUrl } : {}),
            ...(media.mediaProductType === "REELS" ? { isReel: true } : {}),
          };
        }
        setMediaThumbs(index);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [triggerType]);

  const usesTextTrigger = triggerType === "comment" || triggerType === "message";
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

  function addSuggestedKeyword(keyword: string) {
    const current = parseKeywords(keywords);
    if (current.some((existing) => existing.toLowerCase() === keyword.toLowerCase())) return;
    setKeywords(commaSeparated([...current, keyword]));
  }

  const wizardSteps = [
    "trigger",
    ...(usesTextTrigger ? ["condition"] : []),
    "action",
    ...(hasEmailStep ? ["email"] : []),
    "guardrails",
    "review",
  ] as const;
  const wizardLabels: Record<string, string> = {
    trigger: "When this happens",
    condition: "Who should get it",
    action: "Linkar will do this",
    email: "Ask for an email",
    guardrails: "Limits",
    review: "Review",
  };
  const clampedStep = Math.min(activeStep, wizardSteps.length - 1);
  const stepIndex = (key: string) => wizardSteps.indexOf(key as (typeof wizardSteps)[number]);

  function previewViewForStep(key: string): PreviewView {
    if (triggerType !== "comment") return "dm";
    return key === "trigger" || key === "condition" ? "post" : "dm";
  }

  function validateStep(key: (typeof wizardSteps)[number]): string | null {
    if (key === "trigger") {
      if (!name.trim()) return "Give this automation a name first.";
      if (usesTextTrigger && triggerMatch === "keyword" && parseKeywords(keywords).length === 0) {
        return "Add at least one keyword.";
      }
    }
    if (key === "condition" && conditionType !== "" && parseCommaSeparated(conditionValue).length === 0) {
      return "Add at least one condition value, or choose no extra condition.";
    }
    if (key === "action") {
      if (actions.some((action) => action.type !== "send_image" && !action.text.trim())) return "Every message needs text.";
      if (actions.some((action) => action.type === "send_image" && !action.imageUrl.trim())) return "Image actions need a public image URL.";
      if (actions.some((action) => (action.type === "send_link" || action.type === "send_button") && !action.url.trim())) {
        return "Link actions need a URL.";
      }
      if (actions.some((action) => action.type === "quick_replies" && !action.replies.some((reply) => reply.trim()))) {
        return "Quick-reply actions need at least one reply chip.";
      }
      if (followUps.some((followUp) => followUp.text.trim() && followUp.buttonLabel.trim() && !followUp.url.trim())) {
        return "A follow-up button needs its link URL.";
      }
    }
    if (key === "email") {
      if (emailCaptureEnabled && (!emailPrompt.trim() || !emailConfirmation.trim())) {
        return "The email collector needs both a prompt and a confirmation message.";
      }
      if (emailCaptureEnabled && deliveryEnabled && (!deliverySubject.trim() || !deliveryMessage.trim())) {
        return "The fulfillment email needs a subject and a message.";
      }
    }
    if (key === "guardrails") {
      const startsAt = localInputToIso(scheduleStart);
      const endsAt = localInputToIso(scheduleEnd);
      if (scheduleStart && !startsAt) return "Enter a valid start date and time.";
      if (scheduleEnd && !endsAt) return "Enter a valid end date and time.";
      if (startsAt && endsAt && startsAt > endsAt) return "The start must come before the end of the schedule.";
    }
    return null;
  }

  function goToStep(next: number) {
    const clamped = Math.max(0, Math.min(wizardSteps.length - 1, next));
    if (clamped > highestUnlockedStep) return;
    if (clamped > clampedStep) {
      const validationError = validateStep(wizardSteps[clampedStep]);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setError("");
    setActiveStep(clamped);
    setPreviewView(previewViewForStep(wizardSteps[clamped]));
  }

  function goToNextStep() {
    const validationError = validateStep(wizardSteps[clampedStep]);
    if (validationError) {
      setError(validationError);
      return;
    }
    const next = Math.min(wizardSteps.length - 1, clampedStep + 1);
    setError("");
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
    if (value === "message" || value === "referral" || value === "optin" || value === "first_contact" || value === "story_mention") {
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
        : triggerType === "message"
          ? {
              type: "message",
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

  async function save(intent: "draft" | "activate") {
    setError("");
    setSavedIntent(null);
    if (!name.trim()) {
      setError("Give this automation a name first.");
      return;
    }
    if (usesTextTrigger && triggerMatch === "keyword" && parseKeywords(keywords).length === 0) {
      setError("Add at least one keyword.");
      return;
    }
    const startsAt = localInputToIso(scheduleStart);
    const endsAt = localInputToIso(scheduleEnd);
    if (scheduleStart && !startsAt) {
      setError("Enter a valid start date and time.");
      return;
    }
    if (scheduleEnd && !endsAt) {
      setError("Enter a valid end date and time.");
      return;
    }
    if (startsAt && endsAt && startsAt > endsAt) {
      setError("The start must come before the end of the schedule.");
      return;
    }
    if (actions.some((action) => action.type !== "send_image" && !action.text.trim())) {
      setError("Every message needs text.");
      return;
    }
    if (actions.some((action) => action.type === "send_image" && !action.imageUrl.trim())) {
      setError("Image actions need a public image URL.");
      return;
    }
    if (actions.some((action) => (action.type === "send_link" || action.type === "send_button") && !action.url.trim())) {
      setError("Link actions need a URL.");
      return;
    }
    if (actions.some((action) => action.type === "quick_replies" && !action.replies.some((reply) => reply.trim()))) {
      setError("Quick-reply actions need at least one reply chip.");
      return;
    }
    if (followUps.some((followUp) => followUp.text.trim() && followUp.buttonLabel.trim() && !followUp.url.trim())) {
      setError("A follow-up button needs its link URL.");
      return;
    }
    if (emailCaptureEnabled && triggerType !== "comment" && (!emailPrompt.trim() || !emailConfirmation.trim())) {
      setError("The email collector needs both a prompt and a confirmation message.");
      return;
    }
    if (emailCaptureEnabled && deliveryEnabled && (!deliverySubject.trim() || !deliveryMessage.trim())) {
      setError("The fulfillment email needs a subject and a message.");
      return;
    }
    setPendingIntent(intent);
    try {
      // Mutually exclusive: the API rejects dual-pinning, so the client only
      // sends the field that the user actually selected. A future iteration
      // could keep both visible as a clear "either/or" picker; the current UX
      // toggles the channel explicitly so the saved payload never carries a
      // pair of pins.
      const parsedPriority = Number.parseInt(priority, 10);
      const body: { provider: "INSTAGRAM" | "FACEBOOK"; name: string; definition: FlowDefinitionV1; priority?: number; status: "DRAFT" | "ACTIVE"; instagramAccountId?: string | null; facebookPageId?: string | null } = {
        provider: channel,
        name,
        definition: buildDefinition(),
        priority: Number.isFinite(parsedPriority) ? parsedPriority : 0,
        status: intent === "activate" ? "ACTIVE" : "DRAFT",
      };
      if (channel === "FACEBOOK") {
        if (!facebookPageId) throw new Error("Select a connected Facebook Page before saving.");
        body.facebookPageId = facebookPageId;
        body.instagramAccountId = null;
      } else {
        body.instagramAccountId = instagramAccountId || null;
        body.facebookPageId = null;
      }
      const response = await fetch(automationId ? `/api/automations/${automationId}` : "/api/automations", {
        method: automationId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: { id?: string }; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not save this automation");
      onSaved?.(payload.data);
      setSavedIntent(intent);
    } catch (caught) {
      setError(toReadableApiError(caught instanceof Error ? caught.message : caught, "Could not save this automation"));
    } finally {
      setPendingIntent(null);
    }
  }

  const dmMessages: DmBubble[] = actions.flatMap((action, index) => {
    const bubbles: DmBubble[] = [];
    if (action.type === "send_image" && action.imageUrl.trim()) {
      bubbles.push({ id: `action-${index}`, from: "bot", imageUrl: action.imageUrl });
    } else if (action.type !== "send_image" && action.text.trim()) {
      bubbles.push({ id: `action-${index}`, from: "bot", text: action.text });
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

  return (
    <form className="builder-layout" onSubmit={(event) => { event.preventDefault(); void save("activate"); }}>
      {error ? <ActionNotice tone="error" message={error} onDismiss={() => setError("")} /> : null}
      {!error && savedIntent ? (
        <ActionNotice
          tone="success"
          message={savedIntent === "activate" ? "Saved and activated." : "Saved to your workspace as a draft."}
          onDismiss={() => setSavedIntent(null)}
        />
      ) : null}
      <div className="builder-main">
        <div className="builder-intro">
          <div>
            <p className="eyebrow">Guided builder</p>
            <h1>{automationId ? "Edit this automatic reply" : "Create an automatic reply"}</h1>
            <p className="muted">Choose what starts the reply, write what Linkar should send, then review it before turning it on.</p>
          </div>
        </div>

        <label className="field field-wide">
          <span>Give this reply a name</span>
          <input
            aria-label="Reply name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Send the creator guide"
            maxLength={120}
          />
        </label>

        <ChannelSelector
          channel={channel}
          instagramAccountId={instagramAccountId}
          facebookPageId={facebookPageId}
          instagramConnections={connections}
          facebookPages={facebookPages}
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

        <nav className="wizard-progress" aria-label="Builder steps">
          {wizardSteps.map((key, index) => (
            <button
              type="button"
              key={key}
              className={`wizard-progress-step${index === clampedStep ? " is-active" : ""}${index < clampedStep ? " is-done" : ""}${index > highestUnlockedStep ? " is-locked" : ""}`}
              disabled={index > highestUnlockedStep}
              onClick={() => goToStep(index)}
            >
              <span className="wizard-progress-index">{index < clampedStep ? <Check size={12} /> : index + 1}</span>
              <span className="wizard-progress-label">{wizardLabels[key]}</span>
            </button>
          ))}
        </nav>

        <div className={`wizard-step${clampedStep === stepIndex("trigger") ? "" : " is-hidden"}`}>
        <section className="flow-step">
          <div className="step-marker trigger-marker">01</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">When this happens</p>
                <h2>What should start this reply?</h2>
              </div>
              <MessageCircle size={21} strokeWidth={1.7} />
            </div>
            <div className="field-grid">
              <label className="field">
                <span>Where will it start?</span>
                <span className="select-wrap">
                  <select
                    aria-label="Where will it start?"
                    value={triggerType}
                    onChange={(event) => changeTriggerType(event.target.value as ClassicTriggerType)}
                  >
                    <option value="comment">{isFacebook ? "Facebook Page comment" : "Instagram comment"}</option>
                    {!isFacebook && <option value="message">Instagram DM</option>}
                    {!isFacebook && <option value="first_contact">First-time contact</option>}
                    {!isFacebook && <option value="story_mention">Story mention</option>}
                    {!isFacebook && <option value="referral">Referral link tap</option>}
                    {!isFacebook && <option value="optin">Permission button tap</option>}
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              {usesTextTrigger && (
                <label className="field">
                  <span>Which messages count?</span>
                  <span className="select-wrap">
                    <select
                      aria-label="Which messages count?"
                      value={triggerMatch}
                      onChange={(event) => setTriggerMatch(event.target.value as "keyword" | "any")}
                    >
                      <option value="keyword">A keyword</option>
                      <option value="any">Any {triggerType === "comment" ? "comment" : "message"}</option>
                    </select>
                    <ChevronDown size={16} />
                  </span>
                </label>
              )}
            </div>
            {usesTextTrigger && triggerMatch === "keyword" && (
              <>
              <label className="field field-spaced">
                <span>What words should Linkar look for?</span>
                <input
                  aria-label="Words to look for"
                  value={keywords}
                  onChange={(event) => setKeywords(event.target.value)}
                  placeholder="guide, price, link"
                />
                <small>Separate multiple phrases with commas. Matching is case-insensitive.</small>
                {suggestions.length > 0 && (
                  <span className="keyword-suggestions" data-testid="keyword-suggestions">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="keyword-suggestion-chip"
                        onClick={() => addSuggestedKeyword(suggestion)}
                      >
                        + {suggestion}
                      </button>
                    ))}
                  </span>
                )}
              </label>
              {triggerType === "comment" && (
                <CommentKeywordControls
                  mode={keywordMode}
                  negativeKeywords={negativeKeywords}
                  onModeChange={setKeywordMode}
                  onNegativeKeywordsChange={setNegativeKeywords}
                />
              )}
              </>
            )}
            {triggerType === "comment" && (
              <CommentConditionsSection
                mediaIds={mediaIds}
                replyOncePerUser={replyOncePerUser}
                provider={channel}
                onMediaIdsChange={setMediaIds}
                onReplyOncePerUserChange={setReplyOncePerUser}
              />
            )}
          </div>
        </section>
        </div>

        {usesTextTrigger && (
          <div className={`wizard-step${clampedStep === stepIndex("condition") ? "" : " is-hidden"}`}>
            <section className="flow-step">
              <div className="step-marker condition-marker">02</div>
              <div className="step-content">
                <div className="step-heading">
                  <div>
                    <p className="eyebrow">Who should get it <em>optional</em></p>
                    <h2>Add another check if you need one</h2>
                  </div>
                  <CircleHelp size={21} strokeWidth={1.7} />
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span>Only continue if</span>
                    <span className="select-wrap">
                      <select
                        aria-label="Condition type"
                        value={conditionType}
                        onChange={(event) => setConditionType(event.target.value as "" | FlowCondition["type"])}
                      >
                        <option value="">No extra condition</option>
                        <option value="contains_keyword">The text contains a keyword</option>
                        <option value="media_is">The post is one of these IDs</option>
                      </select>
                      <ChevronDown size={16} />
                    </span>
                  </label>
                  {conditionType !== "" && (
                    <label className="field">
                      <span>{conditionType === "contains_keyword" ? "Condition keywords" : "Post IDs"}</span>
                      <input
                        aria-label="Condition value"
                        value={conditionValue}
                        onChange={(event) => setConditionValue(event.target.value)}
                        placeholder="Separate values with commas"
                      />
                    </label>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}

        <div className={`wizard-step${clampedStep === stepIndex("action") ? "" : " is-hidden"}`}>
        <section className="flow-step">
          <div className="step-marker action-marker">{usesTextTrigger ? "03" : "02"}</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Linkar will do this</p>
                <h2>{isFacebook ? "What should Linkar reply publicly?" : "What should the person receive?"}</h2>
              </div>
              <Send size={21} strokeWidth={1.7} />
            </div>
            {actions.map((action, index) => (
              <div className="classic-action" key={index}>
                <div className="classic-action-head">
                  <span className="classic-action-index">Step {index + 1}</span>
                  {!usesTextTrigger && (
                    <span className="select-wrap">
                      <select
                        aria-label={`What Linkar should send in step ${index + 1}`}
                        value={action.type}
                        onChange={(event) => changeActionType(index, event.target.value as FlowAction["type"])}
                      >
                        {allowedActionTypes.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} />
                    </span>
                  )}
                  {actions.length > 1 && (
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Remove step ${index + 1}`}
                      onClick={() => setActions((current) => current.filter((_, actionIndex) => actionIndex !== index))}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                {action.type !== "send_image" && (
                  <label className="field">
                    <span>{isFacebook ? "Public Page reply" : actions.length > 1 ? `Step ${index + 1} message` : "Message text"}</span>
                    <textarea
                      aria-label={isFacebook ? "Public Page reply variation 1" : actions.length > 1 ? `Step ${index + 1} message` : "Message text"}
                      value={action.text}
                      onChange={(event) => updateAction(index, { text: event.target.value })}
                      rows={3}
                      placeholder="Write the exact message to send"
                      maxLength={1_000}
                    />
                    <small>
                      Personalize with <code>{"{username}"}</code> <code>{"{keyword}"}</code> <code>{"{media}"}</code> - they fill in per person.
                    </small>
                  </label>
                )}
                {isFacebook && action.type === "private_reply" && (
                  <PublicPageReplyVariants variants={action.textVariants ?? []} onChange={(textVariants) => updateAction(index, { textVariants })} />
                )}
                {action.type === "send_image" && (
                  <>
                    <label className="field field-spaced">
                      <span>Image URL</span>
                      <div className="input-with-icon">
                        <Link2 size={16} />
                        <input
                          aria-label={actions.length > 1 ? `Step ${index + 1} image URL` : "Image URL"}
                          value={action.imageUrl}
                          onChange={(event) => updateAction(index, { imageUrl: event.target.value } as Partial<FlowAction>)}
                          placeholder="https://your-cdn.com/photo.jpg"
                        />
                      </div>
                      <small>Public https link to the photo Meta should deliver.</small>
                    </label>
                    <label className="field">
                      <span>Caption <em>optional</em></span>
                      <textarea
                        aria-label={actions.length > 1 ? `Step ${index + 1} caption` : "Image caption"}
                        value={action.caption ?? ""}
                        onChange={(event) => updateAction(index, { caption: event.target.value } as Partial<FlowAction>)}
                        rows={2}
                        maxLength={1_000}
                        placeholder="Sent as a text message right after the photo"
                      />
                    </label>
                  </>
                )}
                {(action.type === "send_link" || action.type === "send_button") && (
                  <div className="field-grid field-spaced">
                    <label className="field">
                      <span>{actions.length > 1 ? `Step ${index + 1} link URL` : "Link URL"}</span>
                      <div className="input-with-icon"><Link2 size={16} /><input aria-label={actions.length > 1 ? `Step ${index + 1} link URL` : "Link URL"} value={action.url} onChange={(event) => updateAction(index, { url: event.target.value } as Partial<FlowAction>)} placeholder="https://your-site.com/guide" /></div>
                    </label>
                    {action.type === "send_button" && (
                      <label className="field">
                        <span>{actions.length > 1 ? `Step ${index + 1} button label` : "Button label"}</span>
                        <input aria-label={actions.length > 1 ? `Step ${index + 1} button label` : "Button label"} value={action.buttonLabel} onChange={(event) => updateAction(index, { buttonLabel: event.target.value } as Partial<FlowAction>)} placeholder="Open guide" />
                      </label>
                    )}
                  </div>
                )}
                {action.type === "quick_replies" && (
                  <div className="field-grid field-spaced">
                    {[0, 1, 2, 3].map((chipIndex) => (
                      <label className="field" key={chipIndex}>
                        <span>{actions.length > 1 ? `Step ${index + 1} reply chip ${chipIndex + 1}` : `Reply chip ${chipIndex + 1}`}{chipIndex > 1 ? " optional" : ""}</span>
                        <input
                          aria-label={actions.length > 1 ? `Step ${index + 1} reply chip ${chipIndex + 1}` : `Reply chip ${chipIndex + 1}`}
                          value={action.replies[chipIndex] ?? ""}
                          maxLength={20}
                          placeholder={chipIndex === 0 ? "Sounds good" : chipIndex === 1 ? "Not now" : undefined}
                          onChange={(event) => {
                            const next = [...action.replies];
                            while (next.length < 4) next.push("");
                            next[chipIndex] = event.target.value;
                            updateAction(index, { replies: next } as Partial<FlowAction>);
                          }}
                        />
                      </label>
                    ))}
                    <p className="muted">Up to four chips, 20 characters each. Tapping a chip sends its text back as a message.</p>
                  </div>
                )}
              </div>
            ))}
            {/* Only comment flows are capped at a single action (the schema
                enforces one private reply); every DM-side trigger, keyword
                matched or not, can chain up to MAX_CLASSIC_ACTIONS messages. */}
            {triggerType !== "comment" && actions.length < MAX_CLASSIC_ACTIONS && (
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setActions((current) => [...current, newClassicAction("send_text")])}
              >
                <Plus size={15} /> Add another message
              </button>
            )}
            {triggerType !== "comment" && actions.length > 1 && (
              <p className="muted">Messages are sent in order, one after another.</p>
            )}
            {triggerType !== "comment" && (
              <>
                <p className="eyebrow field-spaced">Reminder messages <em>optional · up to 2</em></p>
                <p className="muted">
                  Send a reminder such as “Still interested?” later. Linkar skips it if the person asks
                  not to receive messages or Meta’s reply window has closed.
                </p>
                {followUps.map((followUp, index) => (
                  <div className="classic-action" key={index}>
                    <div className="classic-action-head">
                      <span className="classic-action-index">Reminder {index + 1}</span>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Remove reminder ${index + 1}`}
                        onClick={() => setFollowUps((current) => current.filter((_, i) => i !== index))}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="field-grid field-spaced">
                      <label className="field">
                        <span>Wait before sending (minutes)</span>
                        <input
                          aria-label={`Reminder ${index + 1} delay in minutes`}
                          type="number"
                          min={1}
                          max={10_080}
                          value={followUp.delayMinutes}
                          onChange={(event) =>
                            setFollowUps((current) => current.map((f, i) => (i === index ? { ...f, delayMinutes: event.target.value } : f)))}
                          placeholder="1440 = one day"
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>Reminder message</span>
                      <textarea
                        aria-label={`Reminder ${index + 1} message`}
                        value={followUp.text}
                        onChange={(event) =>
                          setFollowUps((current) => current.map((f, i) => (i === index ? { ...f, text: event.target.value } : f)))}
                        rows={2}
                        maxLength={1_000}
                        placeholder="Still interested? 👋 Your offer expires tonight."
                      />
                      <small>
                        Personalize with <code>{"{username}"}</code> <code>{"{keyword}"}</code> <code>{"{media}"}</code>.
                      </small>
                    </label>
                    <div className="field-grid field-spaced">
                      <label className="field">
                        <span>Button label <em>optional</em></span>
                        <input
                          aria-label={`Reminder ${index + 1} button label`}
                          value={followUp.buttonLabel}
                          onChange={(event) =>
                            setFollowUps((current) => current.map((f, i) => (i === index ? { ...f, buttonLabel: event.target.value } : f)))}
                          maxLength={80}
                          placeholder="Claim the offer"
                        />
                      </label>
                      <label className="field">
                        <span>Reminder link</span>
                        <input
                          aria-label={`Reminder ${index + 1} link URL`}
                          value={followUp.url}
                          onChange={(event) =>
                            setFollowUps((current) => current.map((f, i) => (i === index ? { ...f, url: event.target.value } : f)))}
                          placeholder="https://your-site.com/offer"
                        />
                      </label>
                    </div>
                  </div>
                ))}
                {followUps.length < 2 && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setFollowUps((current) => [...current, { delayMinutes: "1440", text: "", buttonLabel: "", url: "" }])}
                  >
                    <Plus size={15} /> Add a reminder message
                  </button>
                )}
              </>
            )}
          </div>
        </section>
        </div>

        {triggerType !== "comment" && (
          <div className={`wizard-step${clampedStep === stepIndex("email") ? "" : " is-hidden"}`}>
            <section className="flow-step">
            <div className="step-marker action-marker">{usesTextTrigger ? "04" : "03"}</div>
            <div className="step-content">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Email collector <em>optional</em></p>
                  <h2>Collect email addresses automatically</h2>
                </div>
                <Mail size={21} strokeWidth={1.7} />
              </div>
              <label className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={emailCaptureEnabled}
                  onChange={(event) => setEmailCaptureEnabled(event.target.checked)}
                />
                <span>Ask for the person’s email after this flow runs</span>
              </label>
              {emailCaptureEnabled && (
                <>
                  <p className="muted field-spaced">
                    After your messages send, Linkar asks for their email, checks the reply looks like a real
                    address (up to two retries), saves it to your audience list, and confirms. If someone already sent
                    an email in their first message, it’s captured instantly.
                  </p>
                  <label className="field field-spaced">
                    <span>Prompt asking for the email</span>
                    <textarea
                      aria-label="Email prompt"
                      value={emailPrompt}
                      onChange={(event) => setEmailPrompt(event.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="What’s the best email address to send it to?"
                    />
                  </label>
                  <label className="field">
                    <span>Retry message <em>optional</em></span>
                    <textarea
                      aria-label="Email retry message"
                      value={emailRetry}
                      onChange={(event) => setEmailRetry(event.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="Sent when a reply isn’t a valid email address"
                    />
                  </label>
                  <label className="field">
                    <span>Confirmation message</span>
                    <textarea
                      aria-label="Email confirmation message"
                      value={emailConfirmation}
                      onChange={(event) => setEmailConfirmation(event.target.value)}
                      rows={2}
                      maxLength={500}
                      placeholder="You’re in! ✅ Check your inbox."
                    />
                    <small>Captured emails appear on your My Automations page - export them as CSV any time.</small>
                  </label>

                  <label className="field checkbox-field field-spaced">
                    <input
                      type="checkbox"
                      checked={deliveryEnabled}
                      onChange={(event) => setDeliveryEnabled(event.target.checked)}
                    />
                    <span>Email them the deliverable the moment they subscribe</span>
                  </label>
                  {deliveryEnabled && (
                    <>
                      <label className="field field-spaced">
                        <span>Delivery email subject</span>
                        <input
                          aria-label="Delivery email subject"
                          value={deliverySubject}
                          onChange={(event) => setDeliverySubject(event.target.value)}
                          maxLength={200}
                          placeholder="Here’s your guide 🎁"
                        />
                      </label>
                      <label className="field">
                        <span>Delivery email message</span>
                        <textarea
                          aria-label="Delivery email message"
                          value={deliveryMessage}
                          onChange={(event) => setDeliveryMessage(event.target.value)}
                          rows={3}
                          maxLength={1000}
                          placeholder="Thanks for subscribing! Your guide is right here."
                        />
                      </label>
                      <div className="field-grid">
                        <label className="field">
                          <span>Fulfillment link <em>optional</em></span>
                          <input
                            aria-label="Fulfillment link URL"
                            value={deliveryLinkUrl}
                            onChange={(event) => setDeliveryLinkUrl(event.target.value)}
                            placeholder="https://your-site.com/guide.pdf"
                          />
                        </label>
                        <label className="field">
                          <span>Link label <em>optional</em></span>
                          <input
                            aria-label="Fulfillment link label"
                            value={deliveryLinkLabel}
                            onChange={(event) => setDeliveryLinkLabel(event.target.value)}
                            maxLength={80}
                            placeholder="Download the guide"
                          />
                        </label>
                      </div>
                      <p className="muted">Sent from your workspace support address the moment their email is stored.</p>
                    </>
                  )}
                  <label className="field">
                        <span>Send new leads to another app <em>optional</em></span>
                        <input
                          aria-label="App URL for new leads"
                          value={notifyUrl}
                          onChange={(event) => setNotifyUrl(event.target.value)}
                          placeholder="https://hooks.zapier.com/…"
                        />
                        <small>Receives {'{email, automationName, capturedAt}'} as JSON on every capture.</small>
                      </label>
                      <p className="eyebrow field-spaced">Extra questions <em>up to 5</em></p>
                      {captureFields.map((field, index) => (
                        <div className="field field-spaced public-reply-row" key={field.id}>
                          <span>Question {index + 1}</span>
                          <div className="public-reply-input">
                            <input
                              value={field.question}
                              onChange={(event) =>
                                setCaptureFields((current) => current.map((f, i) => (i === index ? { ...f, question: event.target.value } : f)))
                              }
                              maxLength={300}
                              placeholder="e.g. What's your name?"
                            />
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`Remove question ${index + 1}`}
                              onClick={() => setCaptureFields((current) => current.filter((_, i) => i !== index))}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div className="field-grid capture-field-options">
                            <label className="field">
                              <span>Answer type</span>
                              <span className="select-wrap">
                                <select
                                  aria-label={`Question ${index + 1} answer type`}
                                  value={field.kind}
                                  onChange={(event) =>
                                    setCaptureFields((current) => current.map((f, i) => (i === index ? { ...f, kind: event.target.value as BuilderField["kind"] } : f)))}
                                >
                                  <option value="text">Anything</option>
                                  <option value="email">Email address</option>
                                  <option value="phone">Phone number</option>
                                  <option value="number">Number</option>
                                </select>
                                <ChevronDown size={16} />
                              </span>
                            </label>
                            <label className="field">
                              <span>Stop words <em>optional</em></span>
                              <input
                                aria-label={`Question ${index + 1} stop words`}
                                value={field.exitKeywords}
                                onChange={(event) =>
                                  setCaptureFields((current) => current.map((f, i) => (i === index ? { ...f, exitKeywords: event.target.value } : f)))}
                                placeholder="no, not now - ends the questions"
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                      {captureFields.length < 5 && (
                        <button
                          type="button"
                          className="button button-secondary field-spaced"
                          onClick={() => setCaptureFields((current) => [...current, { id: `field-${Date.now()}`, question: "", kind: "text", exitKeywords: "" }])}
                        >
                          <Plus size={15} /> Add question
                        </button>
                      )}
                      {captureFields.some((field) => parseKeywords(field.exitKeywords).length > 0) && (
                        <label className="field field-spaced">
                          <span>Stop-words message</span>
                          <textarea
                            aria-label="Stop-words message"
                            value={exitText}
                            onChange={(event) => setExitText(event.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder="Sent when someone answers with a stop word - e.g. “No problem!”"
                          />
                          <small>Their remaining questions are skipped and the lead keeps what was already collected.</small>
                        </label>
                      )}
                  <small>Asked after their email. Answers are saved with the contact and sent to the app URL above.</small>
                </>
              )}
            </div>
            </section>
          </div>
        )}

        <div className={`wizard-step${clampedStep === stepIndex("guardrails") ? "" : " is-hidden"}`}>
        <section className="flow-step">
          <div className="step-marker guard-marker">{usesTextTrigger ? "05" : "04"}</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Limits <em>optional</em></p>
                <h2>Set limits and timing</h2>
              </div>
              <ShieldCheck size={21} strokeWidth={1.7} />
            </div>
            <label className="field">
              <span>Daily send limit</span>
              <input
                aria-label="Daily send limit"
                type="number"
                min={1}
                max={1000}
                value={dailyLimit}
                onChange={(event) => setDailyLimit(event.target.value)}
                placeholder="No limit"
              />
              <small>Pauses the automation for the rest of the day when the cap is reached.</small>
            </label>
            <AutomationPriorityField value={priority} onChange={setPriority} />
            <div className="field-grid field-spaced">
              <label className="field">
                <span>Active from <em>optional</em></span>
                <input
                  aria-label="Schedule start"
                  type="datetime-local"
                  value={scheduleStart}
                  onChange={(event) => setScheduleStart(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Active until <em>optional</em></span>
                <input
                  aria-label="Schedule end"
                  type="datetime-local"
                  value={scheduleEnd}
                  onChange={(event) => setScheduleEnd(event.target.value)}
                />
              </label>
            </div>
            <p className="muted">Events outside the window are ignored - perfect for launches and limited offers.</p>
          </div>
        </section>
        </div>

        <div className={`wizard-step${clampedStep === stepIndex("review") ? "" : " is-hidden"}`}>
        <section className="flow-step review-step">
          <div className="step-marker trigger-marker">{String(wizardSteps.length).padStart(2, "0")}</div>
          <div className="step-content">
            <div className="step-heading">
              <div>
                <p className="eyebrow">Review</p>
                <h2>Review before you save</h2>
              </div>
              <Check size={21} strokeWidth={1.7} />
            </div>
            <ul className="review-summary" data-testid="review-summary">
              <li>
                Starts when there is {triggerType === "comment" ? "a comment" : triggerType === "message" ? "a message" : triggerType === "referral" ? "a referral-link tap" : triggerType === "optin" ? "a permission-button tap" : triggerType === "first_contact" ? "a first message" : "a Story mention"}
                {usesTextTrigger ? (triggerMatch === "keyword" ? ` containing “${parseKeywords(keywords).join("”, “") || "add a keyword"}”` : " (any text)") : ""}
              </li>
              <li>{actions.length} message{actions.length === 1 ? "" : "s"} ready to send</li>
              {triggerType !== "comment" && emailCaptureEnabled && <li>Asks the person for their email after replying</li>}
              {followUps.filter((followUp) => followUp.text.trim()).length > 0 && (
                <li>{followUps.filter((followUp) => followUp.text.trim()).length} reminder message{followUps.filter((followUp) => followUp.text.trim()).length === 1 ? "" : "s"} scheduled</li>
              )}
              {dailyLimit && <li>Daily send limit: {dailyLimit}</li>}
              <li>Priority: {priority || "0"}</li>
              <ChannelReviewItem provider={channel} connectionName={facebookPages.find((page) => page.pageId === facebookPageId)?.pageName} />
              {(scheduleStart || scheduleEnd) && (
                <li>Active {scheduleStart ? `from ${scheduleStart}` : ""}{scheduleStart && scheduleEnd ? " " : ""}{scheduleEnd ? `until ${scheduleEnd}` : ""}</li>
              )}
            </ul>
            {hasPlaceholderLinks && (
              <p className="form-warning" role="status">
                <AlertTriangle size={14} /> A link here still points at example.com - swap in your own before this
                goes live, or the people who reply will get a dead link.
              </p>
            )}
          </div>
        </section>
        </div>

        <div className="builder-footer">
          <button type="button" aria-label="Open phone mockup" className="button button-secondary builder-mobile-preview-trigger" onClick={() => { setError(""); setMobilePreviewOpen(true); }}>
            <Eye size={16} /> Preview
          </button>
          <div className="builder-actions">
            {clampedStep > 0 && (
              <button type="button" className="button button-secondary" onClick={() => goToStep(clampedStep - 1)}>
                Back
              </button>
            )}
            {clampedStep < wizardSteps.length - 1 ? (
              <button type="button" className="button button-primary" onClick={goToNextStep}>
                Next
              </button>
            ) : (
              <>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={pendingIntent !== null}
                  onClick={() => void save("draft")}
                >
                  {pendingIntent === "draft" ? "Saving…" : "Save draft"}
                </button>
                <button className="button button-primary" type="submit" disabled={pendingIntent !== null}>
                  {pendingIntent === "activate" ? "Activating…" : "Save & activate"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {mobilePreviewOpen ? <button type="button" className="builder-preview-scrim" aria-label="Close phone mockup backdrop" onClick={() => setMobilePreviewOpen(false)} /> : null}
      <aside className={`builder-preview${mobilePreviewOpen ? " is-open" : ""}`} aria-label="Message preview">
        <div className="builder-preview-heading">
          <p className="eyebrow">Message preview</p>
          <button type="button" className="icon-button builder-preview-close" aria-label="Close phone mockup" onClick={() => setMobilePreviewOpen(false)}><X size={17} /></button>
        </div>
        <div className="preview-line" />
        {facebookPageId ? (
          <FacebookPagePreview
            pageName={facebookPages.find((p) => p.pageId === facebookPageId)?.pageName ?? "Your Page"}
            pageAvatarUrl={facebookPages.find((p) => p.pageId === facebookPageId)?.avatarUrl}
            posterName="Your brand"
            postBody=""
            commentAuthor="A follower"
            commentText={triggerMatch === "keyword" ? (parseKeywords(keywords)[0] ? `“${parseKeywords(keywords)[0]}”` : "any comment") : "any comment"}
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
            profileId={connection?.igUserId || undefined}
            postImageUrl={previewThumb?.thumbnailUrl}
            postIsReel={previewThumb?.isReel}
            messages={dmMessages}
          />
        )}
      </aside>
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

const WIZARD_STEPS = ["Choose posts", "Comment & reply", "Ask permission", "Send link", "Limits", "Review"] as const;
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
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [highestUnlockedStep, setHighestUnlockedStep] = useState(automationId ? WIZARD_STEPS.length - 1 : 0);
  const [previewView, setPreviewView] = useState<PreviewView>("post");
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const connections = useInstagramConnections();
  const selectedInstagramAccountId = instagramAccountId
    || connections.find((item) => item.igUserId)?.igUserId
    || "";
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

  function validateStep(step: number): string | null {
    if (step === 0) {
      if (!name.trim()) return "Give this automation a name first.";
      if (source === "specific_media" && mediaIds.length === 0) return "Select at least one post or Reel to watch.";
    }
    if (step === 1) {
      if (match === "keyword" && parseKeywords(keywords).length === 0) return "Add at least one keyword.";
      if (publicReplies.every((reply) => !reply.trim())) return "Add at least one public reply.";
      if (publicReplies.map((reply) => reply.trim()).filter(Boolean).length > MAX_PUBLIC_REPLIES) {
        return `Use up to ${MAX_PUBLIC_REPLIES} public reply variations.`;
      }
    }
    if (step === 2) {
      if (!openingText.trim()) return "Write the opening message.";
      if (!optInButtonLabel.trim()) return "Add an opt-in button label.";
      if (optInButtonLabel.trim().length > QUICK_REPLY_LABEL_MAX_LENGTH) return "Quick-reply labels must be 20 characters or fewer.";
      if (recheckButtonLabel.trim().length > QUICK_REPLY_LABEL_MAX_LENGTH) return "Quick-reply labels must be 20 characters or fewer.";
      if (followGateRequired && !notFollowingMessage.trim()) return "Write the not-following prompt, or turn the follow gate off.";
      if (followGateRequired && !recheckButtonLabel.trim()) return "Add a recheck button label.";
      if (openingVariants.split("\n").filter((variant) => variant.trim()).length > 5) return "Use up to 5 opening message variations.";
    }
    if (step === 3) {
      if (!deliveryText.trim()) return "Write the delivery message.";
      if (!deliveryUrl.trim()) return "Add a delivery link.";
      if (deliveryVariants.split("\n").filter((variant) => variant.trim()).length > 5) return "Use up to 5 delivery message variations.";
      try {
        const url = new URL(deliveryUrl.trim());
        if (url.protocol !== "https:" && !isLocalDeliveryUrl(url)) return "Delivery links must use HTTPS.";
      } catch {
        return "Enter a valid delivery URL.";
      }
    }
    if (step === 4) {
      const startsAt = localInputToIso(scheduleStart);
      const endsAt = localInputToIso(scheduleEnd);
      if (scheduleStart && !startsAt) return "Enter a valid schedule start.";
      if (scheduleEnd && !endsAt) return "Enter a valid schedule end.";
      if (startsAt && endsAt && startsAt > endsAt) return "The start must come before the end of the schedule.";
    }
    return null;
  }

  function validate(): string | null {
    if (!name.trim()) return "Give this automation a name first.";
    if (source === "specific_media" && mediaIds.length === 0) return "Select at least one post or Reel to watch.";
    if (match === "keyword" && parseKeywords(keywords).length === 0) return "Add at least one keyword.";
    if (publicReplies.map((reply) => reply.trim()).filter(Boolean).length > MAX_PUBLIC_REPLIES) {
      return `Use up to ${MAX_PUBLIC_REPLIES} public reply variations.`;
    }
    if (optInButtonLabel.trim().length > QUICK_REPLY_LABEL_MAX_LENGTH) return "Quick-reply labels must be 20 characters or fewer.";
    if (recheckButtonLabel.trim().length > QUICK_REPLY_LABEL_MAX_LENGTH) return "Quick-reply labels must be 20 characters or fewer.";
    if (followGateRequired && !notFollowingMessage.trim()) return "Write the not-following prompt, or turn the follow gate off.";
    if (!deliveryUrl.trim()) return "Add a delivery link.";
    const startsAt = localInputToIso(scheduleStart);
    const endsAt = localInputToIso(scheduleEnd);
    if (scheduleStart && !startsAt) return "Enter a valid schedule start.";
    if (scheduleEnd && !endsAt) return "Enter a valid schedule end.";
    if (startsAt && endsAt && startsAt > endsAt) return "The start must come before the end of the schedule.";
    if (openingVariants.split("\n").filter((variant) => variant.trim()).length > 5) return "Use up to 5 opening message variations.";
    if (deliveryVariants.split("\n").filter((variant) => variant.trim()).length > 5) return "Use up to 5 delivery message variations.";
    try {
      const url = new URL(deliveryUrl.trim());
      if (url.protocol !== "https:" && !isLocalDeliveryUrl(url)) return "Delivery links must use HTTPS.";
    } catch {
      return "Enter a valid delivery URL.";
    }
    return null;
  }

  async function save(intent: "draft" | "activate") {
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setPendingIntent(intent);
    try {
      const parsedPriority = Number.parseInt(priority, 10);
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
      setSavedAutomationId(payload.data.id);

      onSaved?.(payload.data);
      setSavedIntent(intent);
    } catch (caught) {
      setError(toReadableApiError(caught instanceof Error ? caught.message : caught, "Could not save this automation"));
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

  function goToStep(next: number) {
    const clamped = Math.max(0, Math.min(WIZARD_STEPS.length - 1, next));
    if (clamped > highestUnlockedStep) return;
    if (clamped > activeStep) {
      const validationError = validateStep(activeStep);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setError("");
    setActiveStep(clamped);
    setPreviewView(STEP_PREVIEW_VIEW[clamped]);
  }

  function goToNextStep() {
    const validationError = validateStep(activeStep);
    if (validationError) {
      setError(validationError);
      return;
    }
    const next = Math.min(WIZARD_STEPS.length - 1, activeStep + 1);
    setError("");
    setHighestUnlockedStep((current) => Math.max(current, next));
    setActiveStep(next);
    setPreviewView(STEP_PREVIEW_VIEW[next]);
  }

  const dmMessages: DmBubble[] = [];
  if (openingText.trim()) {
    dmMessages.push({ id: "opening", from: "bot", text: openingText });
    dmMessages.push({ id: "opt-in", from: "tap", button: optInButtonLabel.trim() || "Get it" });
  }
  if (followGateRequired && notFollowingMessage.trim()) {
    dmMessages.push({ id: "not-following", from: "bot", text: notFollowingMessage });
    dmMessages.push({ id: "recheck", from: "tap", button: recheckButtonLabel.trim() || "I followed" });
  }
  if (deliveryText.trim()) {
    dmMessages.push({ id: "delivery", from: "bot", text: deliveryText });
    if (deliveryButtonLabel.trim()) dmMessages.push({ id: "delivery-button", from: "tap", button: deliveryButtonLabel });
  }

  return (
    <div className="builder-layout">
      {error ? <ActionNotice tone="error" message={error} onDismiss={() => setError("")} /> : null}
      {!error && savedIntent ? (
        <ActionNotice
          tone="success"
          message={savedIntent === "activate" ? "Saved and activated." : "Saved to your workspace."}
          onDismiss={() => setSavedIntent(null)}
        />
      ) : null}
      <div className="builder-main">
        <div className="builder-intro">
          <div>
            <p className="eyebrow">Guided builder</p>
            <h1>{savedAutomationId ? "Edit this comment reply" : "Send a link after someone follows you"}</h1>
            <p className="muted">Choose the comment, ask permission to message them, check their follow, and send your link.</p>
          </div>
        </div>

        <label className="field field-wide">
          <span>Give this reply a name</span>
          <input
            aria-label="Reply name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Reel giveaway follow gate"
            maxLength={120}
          />
        </label>

        {connections.length > 1 && (
          <label className="field field-wide">
            <span>Instagram account</span>
            <select
              aria-label="Instagram account"
              value={selectedInstagramAccountId}
              onChange={(event) => setInstagramAccountId(event.target.value)}
            >
              <option value="" disabled>Select a connected account</option>
              {connections.map((item) => (
                <option key={item.igUserId || item.username} value={item.igUserId}>@{item.username}</option>
              ))}
            </select>
          </label>
        )}

        <nav className="wizard-progress" aria-label="Builder steps">
          {WIZARD_STEPS.map((label, index) => (
            <button
              type="button"
              key={label}
              className={`wizard-progress-step${index === activeStep ? " is-active" : ""}${index < activeStep ? " is-done" : ""}${index > highestUnlockedStep ? " is-locked" : ""}`}
              disabled={index > highestUnlockedStep}
              onClick={() => goToStep(index)}
            >
              <span className="wizard-progress-index">{index < activeStep ? <Check size={12} /> : index + 1}</span>
              <span className="wizard-progress-label">{label}</span>
            </button>
          ))}
        </nav>

        <div className={`wizard-step${activeStep === 0 ? "" : " is-hidden"}`}>
          <section className="flow-step">
            <div className="step-marker trigger-marker">01</div>
            <div className="step-content">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Content</p>
                  <h2>Which posts should Linkar watch?</h2>
                </div>
                <Film size={21} strokeWidth={1.7} />
              </div>
              <label className="field">
                <span>Which posts should Linkar watch?</span>
                <span className="select-wrap">
                  <select aria-label="Posts to watch" value={source} onChange={(event) => changeSource(event.target.value as MediaSource)}>
                    <option value="specific_media">Specific posts or Reels</option>
                    <option value="all_media">All of my posts</option>
                    <option value="next_media">The next post I publish</option>
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              {source === "specific_media" && (
                <div className="field-spaced">
                  <MediaPicker
                    selectedIds={mediaIds}
                    initialSnapshots={mediaSnapshots}
                    onIndexChange={onMediaIndexChange}
                    onChange={(ids, snapshots) => {
                      setMediaIds(ids);
                      setMediaSnapshots(snapshots);
                    }}
                  />
                </div>
              )}
            </div>
          </section>
        </div>

        <div className={`wizard-step${activeStep === 1 ? "" : " is-hidden"}`}>
          <section className="flow-step">
            <div className="step-marker condition-marker">02</div>
            <div className="step-content">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">When this happens</p>
                  <h2>What comment starts this campaign?</h2>
                </div>
                <MessageCircle size={21} strokeWidth={1.7} />
              </div>
              <label className="field">
                <span>Which comments count?</span>
                <span className="select-wrap">
                  <select aria-label="Which comments count?" value={match} onChange={(event) => setMatch(event.target.value as "keyword" | "any")}>
                    <option value="keyword">A keyword</option>
                    <option value="any">Any comment</option>
                  </select>
                  <ChevronDown size={16} />
                </span>
              </label>
              {match === "keyword" && (
                <label className="field field-spaced">
                  <span>What words should Linkar look for?</span>
                  <input
                    aria-label="Words to look for"
                    value={keywords}
                    onChange={(event) => setKeywords(event.target.value)}
                    placeholder="drop, giveaway, price"
                  />
                  <small>Separate multiple phrases with commas. Matching is case-insensitive.</small>
                </label>
              )}
            </div>
          </section>

          <section className="flow-step">
            <div className="step-marker action-marker">02</div>
            <div className="step-content">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Public reply <em>up to 5 variations</em></p>
                  <h2>What public reply should Linkar post?</h2>
                </div>
                <Send size={21} strokeWidth={1.7} />
              </div>
              {publicReplies.map((reply, index) => (
                <div className="field field-spaced public-reply-row" key={index}>
                  <span>Variation {index + 1}</span>
                  <div className="public-reply-input">
                    <textarea
                      aria-label={`Public reply variation ${index + 1}`}
                      value={reply}
                      onChange={(event) => updateReply(index, event.target.value)}
                      rows={2}
                      maxLength={1_000}
                      placeholder="Write the exact public comment to post"
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove variation ${index + 1}`}
                      onClick={() => removeReply(index)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="field-support field-spaced">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={addReply}
                  disabled={publicReplies.length >= MAX_PUBLIC_REPLIES}
                >
                  <Plus size={15} /> Add variation
                </button>
                <small>Linkar rotates between variations so the same public comment doesn’t repeat.</small>
              </div>
            </div>
          </section>
        </div>

        <div className={`wizard-step${activeStep === 2 ? "" : " is-hidden"}`}>
          <section className="flow-step">
            <div className="step-marker trigger-marker">03</div>
            <div className="step-content">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Ask permission</p>
                  <h2>Ask before sending the link</h2>
                </div>
                <UserCheck size={21} strokeWidth={1.7} />
              </div>
              <label className="field">
                <span>Opening message text</span>
                <textarea
                  aria-label="Opening message text"
                  value={openingText}
                  onChange={(event) => setOpeningText(event.target.value)}
                  rows={3}
                  maxLength={1_000}
                  placeholder="Explain what they’ll get and invite them to tap the button below"
                />
              </label>
              <label className="field field-spaced">
                <span>Permission button text</span>
                <input
                  aria-label="Permission button text"
                  value={optInButtonLabel}
                  onChange={(event) => setOptInButtonLabel(event.target.value)}
                  maxLength={QUICK_REPLY_LABEL_MAX_LENGTH}
                  placeholder="Get it"
                />
                <small>{optInButtonLabel.length}/{QUICK_REPLY_LABEL_MAX_LENGTH} characters</small>
              </label>
              <label className="field field-spaced">
                <span>Opening copy variations <em>optional</em></span>
                <textarea
                  aria-label="Opening copy variations"
                  value={openingVariants}
                  onChange={(event) => setOpeningVariants(event.target.value)}
                  rows={3}
                  placeholder={"One variation per line - one is picked per person at random"}
                />
                <small>Linkar keeps the same permission button and rotates the message for each person.</small>
              </label>
            </div>
          </section>

          <section className="flow-step">
            <div className="step-marker condition-marker">03</div>
            <div className="step-content">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Follower check</p>
                  <h2>Check if they follow you before sending the link</h2>
                </div>
                <ShieldCheck size={21} strokeWidth={1.7} />
              </div>
              <label className="field field-spaced gate-toggle">
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Check whether they follow you"
                  checked={followGateRequired}
                  onChange={(event) => setFollowGateRequired(event.target.checked)}
                />
                <span>{followGateRequired ? "On - check that they follow you before sending the link" : "Off - send the link after they give permission"}</span>
              </label>
              {followGateRequired && (
                <FollowGateFields
                  notFollowingMessage={notFollowingMessage}
                  onNotFollowingMessageChange={setNotFollowingMessage}
                  recheckButtonLabel={recheckButtonLabel}
                  onRecheckButtonLabelChange={setRecheckButtonLabel}
                />
              )}
            </div>
          </section>
        </div>

        <div className={`wizard-step${activeStep === 3 ? "" : " is-hidden"}`}>
          <section className="flow-step">
            <div className="step-marker action-marker">04</div>
            <div className="step-content">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Send the link</p>
                  <h2>What should Linkar send?</h2>
                </div>
                <Link2 size={21} strokeWidth={1.7} />
              </div>
              <label className="field">
                <span>Message</span>
                <textarea
                  aria-label="Message to send with the link"
                  value={deliveryText}
                  onChange={(event) => setDeliveryText(event.target.value)}
                  rows={2}
                  maxLength={1_000}
                  placeholder="The exact message sent once someone is verified"
                />
              </label>
              <div className="field-grid field-spaced">
                <label className="field">
                  <span>Link</span>
                  <div className="input-with-icon">
                    <Link2 size={16} />
                    <input
                      aria-label="Link to send"
                      value={deliveryUrl}
                      onChange={(event) => setDeliveryUrl(event.target.value)}
                      placeholder="https://your-site.com/prize"
                    />
                  </div>
                  <small>HTTPS required. http://localhost is permitted while developing.</small>
                  {looksLikeTwoLinksPastedTogether(deliveryUrl) && (
                    <p className="form-warning" role="status">
                      <AlertTriangle size={14} /> This looks like two links pasted together - double check it before saving.
                    </p>
                  )}
                </label>
                <label className="field">
                  <span>Button text <em>optional</em></span>
                  <input
                    aria-label="Link button text"
                    value={deliveryButtonLabel}
                    onChange={(event) => setDeliveryButtonLabel(event.target.value)}
                    maxLength={80}
                    placeholder="Open link"
                  />
                </label>
              </div>
              <label className="field field-spaced">
                <span>Other ways to say it <em>optional</em></span>
                <textarea
                  aria-label="Other message versions"
                  value={deliveryVariants}
                  onChange={(event) => setDeliveryVariants(event.target.value)}
                  rows={3}
                  placeholder={"One variation per line - one is picked per person at random"}
                />
              </label>
            </div>
          </section>
        </div>

        <div className={`wizard-step${activeStep === 4 ? "" : " is-hidden"}`}>
          <section className="flow-step">
            <div className="step-marker guard-marker">05</div>
            <div className="step-content">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Limits <em>optional</em></p>
                  <h2>Set limits and timing</h2>
                </div>
                <ShieldCheck size={21} strokeWidth={1.7} />
              </div>
              <label className="field">
                <span>Daily send limit</span>
                <input
                  aria-label="Campaign daily send limit"
                  type="number"
                  min={1}
                  max={1000}
                  value={campaignDailyLimit}
                  onChange={(event) => setCampaignDailyLimit(event.target.value)}
                  placeholder="No limit"
                />
                <small>Pauses new deliveries for the rest of the day when the cap is reached.</small>
              </label>
              <AutomationPriorityField value={priority} onChange={setPriority} />
              <div className="field-grid field-spaced">
                <label className="field">
                  <span>Active from <em>optional</em></span>
                  <input
                    aria-label="Campaign schedule start"
                    type="datetime-local"
                    value={scheduleStart}
                    onChange={(event) => setScheduleStart(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Active until <em>optional</em></span>
                  <input
                    aria-label="Campaign schedule end"
                    type="datetime-local"
                    value={scheduleEnd}
                    onChange={(event) => setScheduleEnd(event.target.value)}
                  />
                </label>
              </div>
              <p className="muted">Comments outside the window are ignored - perfect for launches and limited drops.</p>
            </div>
          </section>
        </div>

        <div className={`wizard-step${activeStep === 5 ? "" : " is-hidden"}`}>
          <section className="flow-step review-step">
            <div className="step-marker trigger-marker">06</div>
            <div className="step-content">
              <div className="step-heading">
                <div>
                  <p className="eyebrow">Review</p>
                  <h2>Review before you save</h2>
                </div>
                <Check size={21} strokeWidth={1.7} />
              </div>
              <ul className="review-summary" data-testid="review-summary">
                <li>Watching {sourceSummary}</li>
                <li>Starts when {match === "keyword" ? (keywordList.length ? `a comment contains “${keywordList.join("”, “")}”` : "a chosen word appears in a comment") : "anyone comments"}</li>
                <li>{nonEmptyReplies.length || "No"} public reply variation{nonEmptyReplies.length === 1 ? "" : "s"} ready</li>
                {followGateRequired ? (
                  <>
                    <li>Linkar asks permission and checks whether they follow you before sending the link</li>
                    <li>Recheck button reads “{recheckButtonLabel || "add a label"}”</li>
                  </>
                ) : (
                  <li>The follow check is off, so the link goes out after they give permission</li>
                )}
                <li>
                  People who follow you receive{" "}
                  {deliveryUrl ? (
                    <a href={deliveryUrl} target="_blank" rel="noreferrer" className="text-link">{deliveryUrl}</a>
                  ) : (
                    "no link yet"
                  )}
                </li>
                {campaignDailyLimit && <li>Daily send limit: {campaignDailyLimit}</li>}
                {(scheduleStart || scheduleEnd) && (
                  <li>Active {scheduleStart ? `from ${scheduleStart}` : ""}{scheduleStart && scheduleEnd ? " " : ""}{scheduleEnd ? `until ${scheduleEnd}` : ""}</li>
                )}
              </ul>
            </div>
          </section>
        </div>

        <div className="builder-footer">
          <button type="button" aria-label="Open phone mockup" className="button button-secondary builder-mobile-preview-trigger" onClick={() => { setError(""); setMobilePreviewOpen(true); }}>
            <Eye size={16} /> Preview
          </button>
          <div className="builder-actions">
            {activeStep > 0 && (
              <button type="button" className="button button-secondary" onClick={() => goToStep(activeStep - 1)}>
                Back
              </button>
            )}
            {activeStep < WIZARD_STEPS.length - 1 ? (
              <button type="button" className="button button-primary" onClick={goToNextStep}>
                Next
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void save("draft")}
                  disabled={pendingIntent !== null}
                >
                  {pendingIntent === "draft" ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void save("activate")}
                  disabled={pendingIntent !== null}
                >
                  {pendingIntent === "activate" ? "Activating…" : "Save & activate"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {mobilePreviewOpen ? <button type="button" className="builder-preview-scrim" aria-label="Close phone mockup backdrop" onClick={() => setMobilePreviewOpen(false)} /> : null}
      <aside className={`builder-preview${mobilePreviewOpen ? " is-open" : ""}`} aria-label="Message preview">
        <div className="builder-preview-heading">
          <p className="eyebrow">Message preview</p>
          <button type="button" className="icon-button builder-preview-close" aria-label="Close phone mockup" onClick={() => setMobilePreviewOpen(false)}><X size={17} /></button>
        </div>
        <div className="preview-line" />
        <InstagramPreview
          view={previewView}
          onViewChange={setPreviewView}
          username={connection?.username ?? "yourbrand"}
          avatarUrl={connection?.avatarUrl}
          profileId={connection?.igUserId || undefined}
          postCaption={mediaSnapshots[0]?.caption}
          postImageUrl={mediaSnapshots[0] ? mediaIndex[mediaSnapshots[0].id]?.thumbnailUrl : undefined}
          postIsReel={mediaSnapshots[0]?.mediaProductType === "REELS"}
          triggerComment={match === "keyword" ? (keywordList[0] ? `“${keywordList[0]}”` : undefined) : "any comment"}
          commentReply={nonEmptyReplies[0]}
          messages={dmMessages}
        />
      </aside>
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
