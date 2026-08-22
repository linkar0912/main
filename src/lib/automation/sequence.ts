import { z } from "zod";

/**
 * Validation for timed drip campaigns (sequences). Steps are ordered messages, each
 * delivered `delayHours` after the previous one; step 0 goes out right on enrollment.
 */
const stepSchema = z.object({
  id: z.string().trim().min(1),
  delayHours: z.number().int().min(0).max(24 * 90),
  text: z.string().trim().min(1).max(1_000),
});

function assertUniqueStepIds(steps: { id: string }[], context: z.RefinementCtx): void {
  if (new Set(steps.map((step) => step.id)).size !== steps.length) {
    context.addIssue({ code: "custom", path: ["steps"], message: "Step IDs must be unique" });
  }
}

export const sequenceSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]),
    sourceAutomationId: z.string().trim().min(1).optional(),
    steps: z.array(stepSchema).min(1).max(10),
  })
  .superRefine((sequence, context) => assertUniqueStepIds(sequence.steps, context));

/** Partial variant for PATCH updates (unique-step rule applies whenever steps are sent). */
export const sequencePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]).optional(),
    sourceAutomationId: z.string().trim().min(1).optional(),
    steps: z.array(stepSchema).min(1).max(10).optional(),
  })
  .superRefine((patch, context) => {
    if (patch.steps) assertUniqueStepIds(patch.steps, context);
  });

export type SequenceInput = z.infer<typeof sequenceSchema>;

export function parseSequenceInput(input: unknown): SequenceInput {
  return sequenceSchema.parse(input);
}
