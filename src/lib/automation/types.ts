export type CommentTrigger = {
  type: "comment";
  match: "keyword" | "any";
  keywords: string[];
  mediaIds: string[];
};

export type MessageTrigger = {
  type: "message";
  match: "keyword" | "any";
  keywords: string[];
};

// Fires when someone taps a Meta referral link (messaging_referral webhook).
export type ReferralTrigger = {
  type: "referral";
};

// Fires when someone opts in through a One-Time-Notification request.
export type OptInTrigger = {
  type: "optin";
};

/**
 * Fires on the first interaction a person ever has with the account (any inbound DM-side
 * event). Meta does not expose follower events through its official API, so this is the
 * compliant stand-in for "welcome new followers": each person is greeted exactly once,
 * tracked via the workspace contact registry.
 */
export type FirstContactTrigger = {
  type: "first_contact";
};

// Fires when someone mentions the account in their Instagram Story (delivered by Meta
// as a messages-webhook attachment of type story_mention).
export type StoryMentionTrigger = {
  type: "story_mention";
};

export type FlowCondition =
  | { type: "contains_keyword"; keywords: string[] }
  | { type: "media_is"; mediaIds: string[] };

export type FlowAction =
  | { type: "private_reply"; text: string }
  | { type: "send_text"; text: string }
  | { type: "send_link"; text: string; url: string }
  | { type: "send_button"; text: string; buttonLabel: string; url: string }
  | { type: "send_image"; imageUrl: string; caption?: string };

/**
 * Personalization tokens available in every outbound text (replies, buttons,
 * captions, prompts, follow-ups): {username} → the commenter's handle when the
 * webhook provides one, otherwise "there"; {keyword} → the trigger keyword that
 * matched (keyword flows only); {media} → a friendly label for the post that
 * received the comment. Unknown tokens are left untouched so a typo never
 * corrupts a live reply.
 */
export const PERSONALIZATION_TOKENS = ["{username}", "{keyword}", "{media}"] as const;

/**
 * A timed nudge scheduled after the flow's own messages: "Still interested?"
 * 24 hours later. Delivery is skipped when the person opted out or Meta's
 * 24-hour messaging window has closed.
 */
export type FlowFollowUp = {
  /** Minutes to wait after the flow's messages went out (1 minute .. 7 days). */
  delayMinutes: number;
  text: string;
  buttonLabel?: string;
  url?: string;
};

/** Optional activation window; both bounds are optional ISO datetimes. */
export type FlowSchedule = {
  startsAt?: string;
  endsAt?: string;
};

/**
 * When enabled, flows that match collect the person's email address over DM: the runner
 * appends `promptText` to the flow's actions and waits for the next message from that
 * person, validates it as an email, stores it against their contact record, and replies
 * with `confirmationText` (or `retryText`, up to a small retry budget, when the reply
 * is not an email address).
 */
export type FlowEmailCapture = {
  promptText: string;
  /** Sent when a reply arrives that is not a valid email address. */
  retryText?: string;
  confirmationText: string;
  /**
   * Optional fulfillment email sent to the lead the moment their address is stored -
   * deliver the promised guide/link instead of leaving them with a bare DM.
   */
  delivery?: EmailDelivery;
  /**
   * Optional webhook (Zapier/Make/n8n) that receives {email, automationId,
   * automationName, capturedAt, fields} as JSON the moment collection completes.
   */
  notifyUrl?: string;
  /** Extra questions asked after the email (conversational form). Answers are stored on the contact. */
  fields?: EmailCaptureField[];
  /**
   * Sent when an answer hits a field's `exitKeywords` - ends the question queue
   * early without failing the lead. Falls back to `confirmationText`.
   */
  exitText?: string;
};

export type EmailCaptureField = {
  id: string;
  question: string;
  /**
   * Validation applied to the answer before it is stored: "text" accepts
   * anything, "email" requires an address, "phone" requires a phone number,
   * "number" requires digits. Defaults to "text".
   */
  kind?: "text" | "email" | "phone" | "number";
  /**
   * When the reply contains any of these keywords (case-insensitive), the rest
   * of the question queue is skipped and `emailCapture.exitText` is sent
   * instead - the polite way out of "Do you have a team?" → "no".
   */
  exitKeywords?: string[];
};

/** Fulfillment email configuration for a captured lead. */
export type EmailDelivery = {
  subject: string;
  message: string;
  /** Included as a plain-text line under the message when present. */
  linkUrl?: string;
  /** Label shown before the link; requires `linkUrl`. */
  linkLabel?: string;
};

/**
 * True when the automation's schedule window (if any) includes `at`.
 * Open bounds mean "no bound on that side".
 */
export function withinSchedule(schedule: FlowSchedule | undefined, at: Date): boolean {
  if (!schedule) return true;
  const startsAt = schedule.startsAt ? Date.parse(schedule.startsAt) : Number.NaN;
  const endsAt = schedule.endsAt ? Date.parse(schedule.endsAt) : Number.NaN;
  if (Number.isFinite(startsAt) && at.getTime() < startsAt) return false;
  if (Number.isFinite(endsAt) && at.getTime() >= endsAt) return false;
  return true;
}

export type FlowDefinitionV1 = {
  version: 1;
  trigger: CommentTrigger | MessageTrigger | ReferralTrigger | OptInTrigger | FirstContactTrigger | StoryMentionTrigger;
  conditions: FlowCondition[];
  actions: FlowAction[];
  /** Optional per-automation daily cap on Meta sends, enforced by the runner. */
  dailySendLimit?: number;
  /** Optional activation window; events outside it are skipped. */
  schedule?: FlowSchedule;
  /** Optional DM email-collection follow-up, executed by the runner. */
  emailCapture?: FlowEmailCapture;
  /**
   * Timed nudges sent after the flow's own messages (DM-side triggers only).
   * Each is skipped when the person opted out or the 24-hour messaging window
   * closed before delivery.
   */
  followUps?: FlowFollowUp[];
};

export type MediaSnapshot = {
  id: string;
  caption?: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaProductType?: "AD" | "FEED" | "REELS" | "STORY";
  permalink: string;
  timestamp: string;
};

export type FlowDefinitionV2 = {
  version: 2;
  trigger: {
    type: "comment";
    source: "specific_media" | "all_media" | "next_media";
    mediaIds: string[];
    mediaSnapshots: MediaSnapshot[];
    match: "keyword" | "any";
    keywords: string[];
  };
  publicReplies: string[];
  openingMessage: {
    text: string;
    /** Extra variants; one is picked per participant alongside `text`. */
    textVariants?: string[];
    optInButtonLabel: string;
  };
  followGate: {
    /** When false, the delivery link is sent right after the opt-in tap. */
    required: boolean;
    notFollowingMessage: string;
    recheckButtonLabel: string;
  };
  /** Optional per-automation daily cap on Meta sends, enforced by the runner. */
  dailySendLimit?: number;
  delivery: {
    text: string;
    /** Extra variants; one is picked per participant alongside `text`. */
    textVariants?: string[];
    url: string;
    buttonLabel?: string;
  };
  /** Optional activation window; comments outside it are skipped. */
  schedule?: FlowSchedule;
};

export type FlowDefinition = FlowDefinitionV1 | FlowDefinitionV2;

export type NormalizedEvent = {
  id: string;
  accountId: string;
  type:
  | "comment.created"
  | "message.received"
  | "quick_reply.received"
  | "postback.received"
  | "optin.received"
  | "referral.received"
  | "story_mention.received";
  text: string;
  commentId?: string;
  mediaId?: string;
  recipientId?: string;
  /** Comment author handle from the webhook payload, for {username} personalization. */
  senderUsername?: string;
  interactionPayload?: string;
  timestamp: number;
};

/**
 * Runtime context the runner computes per event and hands to the pure evaluator -
 * currently just whether this sender has never been seen on this account before,
 * which `first_contact` triggers require.
 */
export type EvaluationContext = {
  isNewContact?: boolean;
};

export type ExecutionAction =
  | { type: "private_reply"; commentId: string; text: string }
  | { type: "send_text"; recipientId: string; text: string }
  | { type: "send_link"; recipientId: string; text: string; url: string }
  | {
    type: "send_button";
    recipientId: string;
    text: string;
    buttonLabel: string;
    url: string;
  }
  | { type: "send_image"; recipientId: string; imageUrl: string; caption?: string };

export type EvaluationResult =
  | { status: "matched"; actions: ExecutionAction[]; matchedKeyword?: string }
  | { status: "skipped"; reason: string; actions: [] };
