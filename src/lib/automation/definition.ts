import { z } from "zod";
import type { FlowDefinition } from "./types";

const keyword = z.string().trim().min(1);
const link = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Links must use http or https");

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

const flowSchema = z
  .object({
    version: z.literal(1),
    trigger: z.discriminatedUnion("type", [commentTrigger, messageTrigger]),
    conditions: z.array(condition),
    actions: z.array(action).min(1).max(1),
  })
  .superRefine((flow, context) => {
    if (flow.trigger.match === "keyword" && flow.trigger.keywords.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["trigger", "keywords"],
        message: "Keyword triggers need at least one keyword",
      });
    }

    if (flow.trigger.type === "comment" && flow.trigger.match === "any" && flow.trigger.keywords.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["trigger", "keywords"],
        message: "Any-comment triggers cannot include keywords",
      });
    }

    if (flow.trigger.type === "comment" && flow.actions.some((item) => item.type !== "private_reply")) {
      context.addIssue({
        code: "custom",
        path: ["actions"],
        message: "Comment triggers support only a private reply",
      });
    }

  });

function normalizeKeywords(keywords: string[]): string[] {
  return [...new Set(keywords.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

export function validateFlowDefinition(input: unknown): FlowDefinition {
  const parsed = flowSchema.parse(input);
  return {
    version: 1,
    trigger:
      parsed.trigger.type === "comment"
        ? {
            type: "comment",
            match: parsed.trigger.match,
            keywords: normalizeKeywords(parsed.trigger.keywords),
            mediaIds: parsed.trigger.mediaIds.map((mediaId) => mediaId.trim()).filter(Boolean),
          }
        : {
            type: "message",
            match: parsed.trigger.match,
            keywords: normalizeKeywords(parsed.trigger.keywords),
          },
    conditions: parsed.conditions.map((item) =>
      item.type === "contains_keyword"
        ? { type: item.type, keywords: normalizeKeywords(item.keywords) }
        : { type: item.type, mediaIds: item.mediaIds.map((mediaId) => mediaId.trim()).filter(Boolean) },
    ),
    actions: parsed.actions.map((item) => ({ ...item, text: item.text.trim() })) as FlowDefinition["actions"],
  };
}
