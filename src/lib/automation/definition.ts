import { z } from "zod";
import type { FlowDefinition, FlowDefinitionV1, FlowDefinitionV2, FlowSchedule } from "./types";

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
]);

const flowV1Schema = z
  .object({
    version: z.literal(1),
    trigger: z.discriminatedUnion("type", [commentTrigger, messageTrigger, referralTrigger, optinTrigger]),
    conditions: z.array(condition),
    actions: z.array(action).min(1).max(3),
    dailySendLimit: z.number().int().min(1).max(1_000).optional(),
    schedule: scheduleSchema.optional(),
  })
  .superRefine((flow, context) => {
    if (flow.trigger.type === "comment") {
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
          message: "Any-comment triggers cannot include keywords",
        });
      }

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
    // keyword conditions and media conditions cannot apply to them.
    if ((flow.trigger.type === "referral" || flow.trigger.type === "optin") && flow.conditions.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["conditions"],
        message: "Referral and opt-in triggers cannot include conditions",
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
    actions: parsed.actions.map((item) => ({ ...item, text: item.text.trim() })),
    ...(parsed.dailySendLimit ? { dailySendLimit: parsed.dailySendLimit } : {}),
    ...(parsed.schedule ? { schedule: normalizeSchedule(parsed.schedule) } : {}),
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
