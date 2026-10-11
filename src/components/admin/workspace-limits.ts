// Plan limits and features for the owner console's workspace page: plain
// labels, usage against each limit, and the form that edits a workspace's
// custom limits. The form serialises to exactly the `overrides` object the
// entitlement API has always taken (EntitlementOverridesSchema): a key left
// out uses the plan's value, `null` is unlimited, a number is a custom limit,
// and a boolean switches a feature on or off for this workspace only.
import { featureKeys, limitKeys } from "@/src/lib/entitlements/types";

export type LimitKey = (typeof limitKeys)[number];
export type FeatureKey = (typeof featureKeys)[number];
export type EntitlementValue = number | boolean | null;
export type Overrides = Partial<Record<LimitKey, number | null> & Record<FeatureKey, boolean>>;

export const LIMITS: Record<LimitKey, { label: string; unit: string }> = {
  memberLimit: { label: "Members", unit: "members" },
  automationLimit: { label: "Automations", unit: "automations" },
  instagramConnectionLimit: { label: "Instagram accounts", unit: "Instagram accounts" },
  facebookConnectionLimit: { label: "Facebook Pages", unit: "Facebook Pages" },
  sequenceLimit: { label: "Sequences", unit: "sequences" },
  monthlyBroadcastLimit: { label: "Broadcasts this month", unit: "broadcasts" },
  monthlyDeliveryLimit: { label: "Messages this month", unit: "messages" },
};

export const FEATURES: Record<FeatureKey, string> = {
  sequencesEnabled: "Sequences",
  broadcastsEnabled: "Broadcasts",
  trackedLinksEnabled: "Tracked links",
  teamEnabled: "Team members",
  facebookEnabled: "Facebook Pages",
  exportsEnabled: "Data exports",
};

export { featureKeys, limitKeys };

export function formatCount(value: number): string {
  return value.toLocaleString("en-IN");
}

export type Usage = {
  memberCount: number;
  automationCount: number;
  instagramConnectionCount: number;
  facebookConnectionCount: number;
  deliveriesReserved?: number;
  broadcastsCreated?: number;
};

/** How much of each limit is in use. Sequences are not counted on this page. */
export function usedFor(key: LimitKey, usage: Usage): number | null {
  switch (key) {
    case "memberLimit": return usage.memberCount;
    case "automationLimit": return usage.automationCount;
    case "instagramConnectionLimit": return usage.instagramConnectionCount;
    case "facebookConnectionLimit": return usage.facebookConnectionCount;
    case "monthlyBroadcastLimit": return usage.broadcastsCreated ?? null;
    case "monthlyDeliveryLimit": return usage.deliveriesReserved ?? null;
    default: return null;
  }
}

export type UsageRow = {
  key: LimitKey;
  label: string;
  used: number | null;
  limit: number | null;
  /** Share of the limit in use, 0-100+, or null when there is no bar to draw. */
  percent: number | null;
  tone: "normal" | "warning" | "danger";
  summary: string;
  planDefault: EntitlementValue | undefined;
  custom: number | null | undefined;
};

export function usageRow(key: LimitKey, usage: Usage, effective: Record<string, EntitlementValue>, defaults: Record<string, EntitlementValue>, overrides: Record<string, EntitlementValue | undefined>): UsageRow {
  const { label, unit } = LIMITS[key];
  const used = usedFor(key, usage);
  const raw = effective[key];
  const limit = typeof raw === "number" ? raw : null;
  let percent: number | null = null;
  let summary: string;
  if (limit === null) {
    summary = used === null ? "Unlimited" : `${formatCount(used)} ${unit}, unlimited`;
  } else if (used === null) {
    summary = `Up to ${formatCount(limit)} ${unit}`;
  } else if (limit === 0) {
    percent = used > 0 ? 100 : null;
    summary = used > 0 ? `${formatCount(used)} ${unit}, none included` : "Not included";
  } else {
    percent = (used / limit) * 100;
    summary = `${formatCount(used)} of ${formatCount(limit)} ${unit} · ${Math.round(percent)}%`;
  }
  const tone = percent === null ? "normal" : percent >= 100 ? "danger" : percent >= 80 ? "warning" : "normal";
  const custom = key in overrides ? (overrides[key] as number | null | undefined) : undefined;
  return { key, label, used, limit, percent, tone, summary, planDefault: key in defaults ? defaults[key] : undefined, custom };
}

export function limitValueLabel(value: EntitlementValue | undefined): string {
  if (value === undefined) return "";
  if (value === null) return "Unlimited";
  if (typeof value === "boolean") return value ? "On" : "Off";
  return formatCount(value);
}

// ── The custom limits form ─────────────────────────────────────────────────

export type LimitField = { value: string; unlimited: boolean };
export type FeatureField = "plan" | "on" | "off";
export type LimitsForm = { limits: Record<LimitKey, LimitField>; features: Record<FeatureKey, FeatureField> };

export function limitsFormFrom(overrides: Record<string, EntitlementValue | undefined>): LimitsForm {
  const limits = Object.fromEntries(limitKeys.map((key) => {
    const value = overrides[key];
    return [key, { value: typeof value === "number" ? String(value) : "", unlimited: value === null }];
  })) as Record<LimitKey, LimitField>;
  const features = Object.fromEntries(featureKeys.map((key) => {
    const value = overrides[key];
    return [key, value === true ? "on" : value === false ? "off" : "plan"];
  })) as Record<FeatureKey, FeatureField>;
  return { limits, features };
}

export type OverridesResult = { ok: true; overrides: Overrides } | { ok: false; key: LimitKey; message: string };

/** Blank = plan default (key left out), Unlimited = null, a whole number = that limit. */
export function overridesFrom(form: LimitsForm): OverridesResult {
  const overrides: Overrides = {};
  for (const key of limitKeys) {
    const field = form.limits[key];
    if (field.unlimited) {
      overrides[key] = null;
      continue;
    }
    const text = field.value.trim().replaceAll(",", "");
    if (!text) continue;
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) {
      return { ok: false, key, message: `${LIMITS[key].label}: enter a whole number of 0 or more, or leave it blank to use the plan's limit.` };
    }
    overrides[key] = Number(text);
  }
  for (const key of featureKeys) {
    const choice = form.features[key];
    if (choice !== "plan") overrides[key] = choice === "on";
  }
  return { ok: true, overrides };
}
