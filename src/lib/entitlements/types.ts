import { z } from "zod";

export const limitKeys = [
  "memberLimit",
  "automationLimit",
  "instagramConnectionLimit",
  "facebookConnectionLimit",
  "sequenceLimit",
  "monthlyBroadcastLimit",
  "monthlyDeliveryLimit",
] as const;

export const featureKeys = [
  "sequencesEnabled",
  "broadcastsEnabled",
  "trackedLinksEnabled",
  "teamEnabled",
  "facebookEnabled",
  "exportsEnabled",
] as const;

const NullableLimit = z.number().int().min(0).nullable();

export const EntitlementOverridesSchema = z.object({
  memberLimit: NullableLimit.optional(),
  automationLimit: NullableLimit.optional(),
  instagramConnectionLimit: NullableLimit.optional(),
  facebookConnectionLimit: NullableLimit.optional(),
  sequenceLimit: NullableLimit.optional(),
  monthlyBroadcastLimit: NullableLimit.optional(),
  monthlyDeliveryLimit: NullableLimit.optional(),
  sequencesEnabled: z.boolean().optional(),
  broadcastsEnabled: z.boolean().optional(),
  trackedLinksEnabled: z.boolean().optional(),
  teamEnabled: z.boolean().optional(),
  facebookEnabled: z.boolean().optional(),
  exportsEnabled: z.boolean().optional(),
}).strict();

export type EntitlementOverrides = z.infer<typeof EntitlementOverridesSchema>;

export type PlanEntitlements = {
  key: string;
  name: string;
  memberLimit: number | null;
  automationLimit: number | null;
  instagramConnectionLimit: number | null;
  facebookConnectionLimit: number | null;
  sequenceLimit: number | null;
  monthlyBroadcastLimit: number | null;
  monthlyDeliveryLimit: number | null;
  sequencesEnabled: boolean;
  broadcastsEnabled: boolean;
  trackedLinksEnabled: boolean;
  teamEnabled: boolean;
  facebookEnabled: boolean;
  exportsEnabled: boolean;
};

export type EffectiveEntitlements = Omit<PlanEntitlements, "key" | "name"> & {
  planKey: string;
  planName: string;
};

export type EntitlementCapability =
  | "members"
  | "automations"
  | "instagram"
  | "facebook"
  | "sequences"
  | "broadcasts"
  | "tracked_links"
  | "exports";
