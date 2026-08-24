import { z } from "zod";
import type { FlowDefinition, FlowDefinitionV1, FlowDefinitionV2, FlowSchedule } from "./types";
import { isSafeOutboundUrl } from "../security/outbound-url";
const keyword = z.string().trim().min(1);
const link = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Links must use http or https");

const isoDatetime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Must be an ISO datetime");

const scheduleSchema = z
  .object({
    startsAt: isoDatetime.optional(),
    endsAt: isoDatetime.optional(),
  })
  .refine(
    (schedule) => schedule.startsAt !== undefined || schedule.endsAt !== undefined,
    "Schedules need at least one bound",
  )
  .refine(
    (schedule) =>
      !schedule.startsAt || !schedule.endsAt || Date.parse(schedule.startsAt) <= Date.parse(schedule.endsAt),
    "Schedule start must not be after its end",
  );

function normalizeSchedule(schedule: FlowSchedule | undefined): FlowSchedule | undefined {
  if (!schedule) return undefined;
  const normalized: FlowSchedule = {};
  if (schedule.startsAt) normalized.startsAt = new Date(schedule.startsAt).toISOString();
  if (schedule.endsAt) normalized.endsAt = new Date(schedule.endsAt).toISOString();
  return normalized;
}

const commentTrigger = z.object({
  type: z.literal("comment"),
  match: z.enum(["keyword", "any"]),
  keywords: z.array(keyword),
  mediaIds: z.array(z.string().trim()),
});

const messageTrigger = z.object({
  type: z.literal("message"),
  match: z.enum(["keyword", "any"]),
  keywords: z.array(keyword),
});

const referralTrigger = z.object({ type: z.literal("referral") });
const optinTrigger = z.object({ type: z.literal("optin") });
const firstContactTrigger = z.object({ type: z.literal("first_contact") });
const storyMentionTrigger = z.object({ type: z.literal("story_mention") });

// DM email collection: the runner sends `promptText` after the flow's actions, waits
// for the person's next message, and either stores it as their email (replying with
// `confirmationText`) or asks again with `retryText` within a small retry budget.
const emailCaptureSchema = z.object({
  promptText: z.string().trim().min(1).max(500),
  retryText: z.string().trim().min(1).max(500).optional(),
  confirmationText: z.string().trim().min(1).max(500),
  // Optional fulfillment email delivered to the lead once their address is stored.
  delivery: z
    .object({
      subject: z.string().trim().min(1).max(200),
      message: z.string().trim().min(1).max(1_000),
      linkUrl: link.optional(),
      linkLabel: z.string().trim().min(1).max(80).optional(),
    })
    .superRefine((delivery, context) => {
      if (delivery.linkLabel && !delivery.linkUrl) {
        context.addIssue({
          code: "custom",
          path: ["linkLabel"],
          message: "A button label needs a link URL",
        });
      }
    })
    .optional(),
  // Outbound lead webhook (Zapier/Make/n8n): receives the captured email as JSON.
  // Unlike `link` (which only ever renders for the recipient) this URL is fetched by
  // the server, so it must not resolve to the host's own network.
  notifyUrl: link
    .refine(isSafeOutboundUrl, "Webhook URL must be a public http(s) address")
    .optional(),
  // Follow-up questions asked after the email (answers stored on the contact).
  fields: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        question: z.string().trim().min(1).max(300),
        kind: z.enum(["text", "email", "phone", "number"]).optional(),
        exitKeywords: z.array(keyword).max(10).optional(),
      }),
    )
    .max(5)
    .optional(),
  // Polite early exit when an answer hits a field's exit keywords.
  exitText: z.string().trim().min(1).max(500).optional(),
})
.superRefine((capture, context) => {
  if (capture.fields && new Set(capture.fields.map((field) => field.id)).size !== capture.fields.length) {
    context.addIssue({ code: "custom", path: ["fields"], message: "Field IDs must be unique" });
  }
});

const condition = z.discriminatedUnion("type", [
  z.object({ type: z.literal("contains_keyword"), keywords: z.array(keyword).min(1) }),
  z.object({ type: z.literal("media_is"), mediaIds: z.array(z.string().trim()).min(1) }),
]);

const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("private_reply"), text: z.string().trim().min(1).max(1_000) }),
  z.object({ type: z.literal("send_text"), text: z.string().trim().min(1).max(1_000) }),
  z.object({ type: z.literal("send_link"), text: z.string().trim().min(1).max(1_000), url: link }),
  z.object({
    type: z.literal("send_button"),
    text: z.string().trim().min(1).max(1_000),
    buttonLabel: z.string().trim().min(1).max(80),
    url: link,
  }),
  z.object({
    type: z.literal("send_image"),
    // Meta fetches the image server-side, so the URL must be publicly reachable.
    imageUrl: link.refine(isSafeOutboundUrl, "Image URL must be a public http(s) address"),
    caption: z.string().trim().min(1).max(1_000).optional(),
  }),
]);

// Timed nudges after a DM flow fires. Comment flows are excluded - a private
// reply alone does not open Meta's 24-hour messaging window, so scheduling a
// later nudge there would mostly fail at send time.
const followUpText = z.string().trim().min(1).max(1_000);
const followUpsSchema = z
  .array(
    z.object({
      delayMinutes: z.number().int().min(1).max(10_080),
      text: followUpText,
      buttonLabel: z.string().trim().min(1).max(80).optional(),
      url: link.optional(),
    })
      .refine(
        (followUp) => !followUp.buttonLabel || Boolean(followUp.url),
        { path: ["buttonLabel"], message: "A button label needs a URL" },
      ),
  )
  .max(2)
  .optional();

const flowV1Schema = z
  .object({
    version: z.literal(1),
    trigger: z.discriminatedUnion("type", [
      commentTrigger,
      messageTrigger,
      referralTrigger,
      optinTrigger,
      firstContactTrigger,
      storyMentionTrigger,
    ]),
    conditions: z.array(condition),
    actions: z.array(action).min(1).max(3),
    dailySendLimit: z.number().int().min(1).max(1_000).optional(),
    schedule: scheduleSchema.optional(),
    emailCapture: emailCaptureSchema.optional(),
    followUps: followUpsSchema,
  })
  .superRefine((flow, context) => {
    if (flow.trigger.type === "comment" || flow.trigger.type === "message") {
      if (flow.trigger.match === "keyword" && flow.trigger.keywords.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["trigger", "keywords"],
          message: "Keyword triggers need at least one keyword",
        });
      }

      if (flow.trigger.match === "any" && flow.trigger.keywords.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["trigger", "keywords"],
          message: flow.trigger.type === "comment"
            ? "Any-comment triggers cannot include keywords"
            : "Any-message triggers cannot include keywords",
        });
      }
    }

    if (flow.trigger.type === "comment") {
      if (flow.actions.some((item) => item.type !== "private_reply")) {
        context.addIssue({
          code: "custom",
          path: ["actions"],
          message: "Comment triggers support only a private reply",
        });
      }
      if (flow.actions.length > 1) {
        context.addIssue({
          code: "custom",
          path: ["actions"],
          message: "Comment triggers support a single private reply",
        });
      }
    }

    // Referral/optin taps carry a ref payload rather than freeform text, so
    // keyword conditions and media conditions cannot apply to them. The same
    // holds for first-contact greetings and story mentions, which have no
    // filterable message content.
    if (
      flow.trigger.type === "referral"
      || flow.trigger.type === "optin"
      || flow.trigger.type === "first_contact"
      || flow.trigger.type === "story_mention"
    ) {
      if (flow.conditions.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["conditions"],
          message: "Referral and opt-in triggers cannot include conditions",
        });
      }
    }

    // Comment flows may only send a single private reply, which cannot carry the
    // extra email prompt the collector appends.
    if (flow.trigger.type === "comment" && flow.emailCapture) {
      context.addIssue({
        code: "custom",
        path: ["emailCapture"],
        message: "Comment triggers cannot collect emails - use a DM, story mention, or first-contact trigger",
      });
    }

    // A private reply does not open Meta's 24-hour messaging window, so a later
    // nudge would almost always be rejected - keep follow-ups on DM-side triggers.
    if (flow.trigger.type === "comment" && flow.followUps && flow.followUps.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["followUps"],
        message: "Comment triggers cannot schedule follow-ups - use a DM, story mention, or first-contact trigger",
      });
    }
  });

const mediaSnapshot = z.object({
  id: z.string().trim().min(1),
  caption: z.string().optional(),
  mediaType: z.enum(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"]),
  mediaProductType: z.enum(["AD", "FEED", "REELS", "STORY"]).optional(),
  permalink: link,
  timestamp: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid ISO datetime"),
});

const campaignText = z.string().trim().min(1).max(1_000);
const quickReplyLabel = z.string().trim().min(1).max(20);
const deliveryUrl = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return process.env.NODE_ENV === "development" ? protocol === "http:" || protocol === "https:" : protocol === "https:";
  }, "Delivery URLs must use HTTPS outside development");

const textVariants = z.array(campaignText).max(5);

const flowV2Schema = z
  .object({
    version: z.literal(2),
    trigger: z.object({
      type: z.literal("comment"),
      source: z.enum(["specific_media", "all_media", "next_media"]),
      mediaIds: z.array(z.string().trim().min(1)),
      mediaSnapshots: z.array(mediaSnapshot),
      match: z.enum(["keyword", "any"]),
      keywords: z.array(keyword),
    }),
    publicReplies: z.array(campaignText).max(5),
    openingMessage: z.object({
      text: campaignText,
      textVariants: textVariants.optional(),
      optInButtonLabel: quickReplyLabel,
    }),
    followGate: z.object({
      required: z.boolean(),
      // Only meaningful when required is true; ungated campaigns may omit both.
      notFollowingMessage: campaignText.optional(),
      recheckButtonLabel: quickReplyLabel.optional(),
    }),
    delivery: z.object({
      text: campaignText,
      textVariants: textVariants.optional(),
      url: deliveryUrl,
      buttonLabel: z.string().trim().min(1).max(80).optional(),
    }),
    // Optional per-automation daily cap on Meta sends; enforced by the runner.
    dailySendLimit: z.number().int().min(1).max(1_000).optional(),
    schedule: scheduleSchema.optional(),
  })
  .superRefine((flow, context) => {
    const mediaIds = new Set(flow.trigger.mediaIds.map((mediaId) => mediaId.trim()));
    const snapshotIds = new Set(flow.trigger.mediaSnapshots.map((snapshot) => snapshot.id.trim()));
    const hasEqualMediaIds =
      mediaIds.size === snapshotIds.size && [...mediaIds].every((mediaId) => snapshotIds.has(mediaId));

    if (snapshotIds.size !== flow.trigger.mediaSnapshots.length) {
      context.addIssue({
        code: "custom",
        path: ["trigger", "mediaSnapshots"],
        message: "Media snapshot IDs must be unique",
      });
    }

    if (flow.trigger.source === "specific_media" && mediaIds.size === 0) {
      context.addIssue({
        code: "custom",
        path: ["trigger", "mediaIds"],
        message: "Specific-media triggers need at least one media ID",
      });
    }

    if (flow.trigger.source !== "specific_media" && mediaIds.size > 0) {
      context.addIssue({
        code: "custom",
        path: ["trigger", "mediaIds"],
        message: "All-media and next-media triggers cannot include media IDs",
      });
    }

    if (!hasEqualMediaIds) {
      context.addIssue({
        code: "custom",
        path: ["trigger", "mediaSnapshots"],
        message: "Media snapshot IDs must match selected media IDs",
      });
    }

    const normalizedKeywords = normalizeKeywords(flow.trigger.keywords);
    if (flow.trigger.match === "keyword" && normalizedKeywords.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["trigger", "keywords"],
        message: "Keyword triggers need at least one keyword",
      });
    }

    if (normalizedKeywords.length !== flow.trigger.keywords.length) {
      context.addIssue({
        code: "custom",
        path: ["trigger", "keywords"],
        message: "Keywords must be unique after normalization",
      });
    }

    if (flow.trigger.match === "any" && flow.trigger.keywords.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["trigger", "keywords"],
        message: "Any-comment triggers cannot include keywords",
      });
    }

    if (flow.followGate.required && !flow.followGate.notFollowingMessage) {
      context.addIssue({
        code: "custom",
        path: ["followGate", "notFollowingMessage"],
        message: "Follow-gated campaigns need a not-following message",
      });
    }

    if (flow.followGate.required && !flow.followGate.recheckButtonLabel) {
      context.addIssue({
        code: "custom",
        path: ["followGate", "recheckButtonLabel"],
        message: "Follow-gated campaigns need a recheck button label",
      });
    }
  });

const flowSchema = z.discriminatedUnion("version", [flowV1Schema, flowV2Schema]);

function normalizeKeywords(keywords: string[]): string[] {
  return [...new Set(keywords.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function normalizeTextVariants(variants: string[] | undefined): string[] | undefined {
  if (!variants) return undefined;
  const normalized = [...new Set(variants.map((value) => value.trim()).filter(Boolean))];
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeV1(parsed: z.output<typeof flowV1Schema>): FlowDefinitionV1 {
  const trigger =
    parsed.trigger.type === "comment"
      ? {
          type: "comment" as const,
          match: parsed.trigger.match,
          keywords: normalizeKeywords(parsed.trigger.keywords),
          mediaIds: parsed.trigger.mediaIds.map((mediaId) => mediaId.trim()).filter(Boolean),
        }
      : parsed.trigger.type === "message"
        ? {
            type: "message" as const,
            match: parsed.trigger.match,
            keywords: normalizeKeywords(parsed.trigger.keywords),
          }
        : { type: parsed.trigger.type };
  return {
    version: 1,
    trigger,
    conditions: parsed.conditions.map((item) =>
      item.type === "contains_keyword"
        ? { type: item.type, keywords: normalizeKeywords(item.keywords) }
        : { type: item.type, mediaIds: item.mediaIds.map((mediaId) => mediaId.trim()).filter(Boolean) },
    ),
    actions: parsed.actions.map((item) =>
      item.type === "send_image"
        ? {
            type: item.type,
            imageUrl: item.imageUrl,
            ...(item.caption ? { caption: item.caption.trim() } : {}),
          }
        : { ...item, text: item.text.trim() },
    ),
    ...(parsed.dailySendLimit ? { dailySendLimit: parsed.dailySendLimit } : {}),
    ...(parsed.schedule ? { schedule: normalizeSchedule(parsed.schedule) } : {}),
    ...(parsed.followUps && parsed.followUps.length > 0
      ? {
          followUps: parsed.followUps.map((followUp) => ({
            delayMinutes: followUp.delayMinutes,
            text: followUp.text.trim(),
            ...(followUp.buttonLabel?.trim() ? { buttonLabel: followUp.buttonLabel.trim() } : {}),
            ...(followUp.url?.trim() ? { url: followUp.url.trim() } : {}),
          })),
        }
      : {}),
    ...(parsed.emailCapture
      ? {
          emailCapture: {
            promptText: parsed.emailCapture.promptText.trim(),
            ...(parsed.emailCapture.retryText?.trim()
              ? { retryText: parsed.emailCapture.retryText.trim() }
              : {}),
            confirmationText: parsed.emailCapture.confirmationText.trim(),
            ...(parsed.emailCapture.delivery
              ? {
                  delivery: {
                    subject: parsed.emailCapture.delivery.subject.trim(),
                    message: parsed.emailCapture.delivery.message.trim(),
                    ...(parsed.emailCapture.delivery.linkUrl?.trim()
                      ? { linkUrl: parsed.emailCapture.delivery.linkUrl.trim() }
                      : {}),
                    ...(parsed.emailCapture.delivery.linkLabel?.trim()
                      ? { linkLabel: parsed.emailCapture.delivery.linkLabel.trim() }
                      : {}),
                  },
                }
              : {}),
            ...(parsed.emailCapture.notifyUrl?.trim()
              ? { notifyUrl: parsed.emailCapture.notifyUrl.trim() }
              : {}),
            ...(parsed.emailCapture.fields
              ? {
                  fields: parsed.emailCapture.fields.map((field) => ({
                    id: field.id.trim(),
                    question: field.question.trim(),
                    ...(field.kind ? { kind: field.kind } : {}),
                    ...(field.exitKeywords && field.exitKeywords.length > 0
                      ? { exitKeywords: field.exitKeywords.map((value) => value.trim().toLowerCase()).filter(Boolean) }
                      : {}),
                  })),
                }
              : {}),
            ...(parsed.emailCapture.exitText?.trim() ? { exitText: parsed.emailCapture.exitText.trim() } : {}),
          },
        }
      : {}),
  };
}

function normalizeV2(parsed: z.output<typeof flowV2Schema>): FlowDefinitionV2 {
  return {
    version: 2,
    trigger: {
      type: "comment",
      source: parsed.trigger.source,
      mediaIds: [...new Set(parsed.trigger.mediaIds.map((mediaId) => mediaId.trim()))],
      mediaSnapshots: parsed.trigger.mediaSnapshots.map((snapshot) => ({
        ...snapshot,
        id: snapshot.id.trim(),
        caption: snapshot.caption?.trim(),
        permalink: snapshot.permalink.trim(),
      })),
      match: parsed.trigger.match,
      keywords: normalizeKeywords(parsed.trigger.keywords),
    },
    publicReplies: parsed.publicReplies.map((reply) => reply.trim()),
    openingMessage: {
      text: parsed.openingMessage.text.trim(),
      ...(normalizeTextVariants(parsed.openingMessage.textVariants)
        ? { textVariants: normalizeTextVariants(parsed.openingMessage.textVariants) }
        : {}),
      optInButtonLabel: parsed.openingMessage.optInButtonLabel.trim(),
    },
    followGate: {
      required: parsed.followGate.required,
      notFollowingMessage: (parsed.followGate.notFollowingMessage ?? "").trim(),
      recheckButtonLabel: (parsed.followGate.recheckButtonLabel ?? "").trim(),
    },
    delivery: {
      text: parsed.delivery.text.trim(),
      ...(normalizeTextVariants(parsed.delivery.textVariants)
        ? { textVariants: normalizeTextVariants(parsed.delivery.textVariants) }
        : {}),
      url: parsed.delivery.url.trim(),
      ...(parsed.delivery.buttonLabel ? { buttonLabel: parsed.delivery.buttonLabel.trim() } : {}),
    },
    ...(parsed.dailySendLimit ? { dailySendLimit: parsed.dailySendLimit } : {}),
    ...(parsed.schedule ? { schedule: normalizeSchedule(parsed.schedule) } : {}),
  };
}

export function validateFlowDefinition(input: unknown): FlowDefinition {
  const parsed = flowSchema.parse(input);
  return parsed.version === 1 ? normalizeV1(parsed) : normalizeV2(parsed);
}
