import type { AutomationParticipantRecord, ParticipantState } from "../repository";

/**
 * Wire shape returned by GET /api/automations/[id]/activity for a single
 * participant. Kept narrow (a `Pick` of the underlying record) so the
 * activity dashboard only sees the fields it actually renders.
 *
 * Both the API route (source of truth) and the activity dashboard
 * component import this type to keep the contract in one place.
 */
export type ParticipantActivitySummary = Pick<
  AutomationParticipantRecord,
  | "id"
  | "state"
  | "sourceMediaSnapshot"
  | "matchedKeyword"
  | "followStatus"
  | "followCheckedAt"
  | "publicReplyStatus"
  | "publicReplyError"
  | "openingStatus"
  | "openingError"
  | "finalDeliveryStatus"
  | "finalDeliveryError"
  | "finalDeliveredAt"
  | "deliveryClickedAt"
  | "variantLabel"
  | "createdAt"
>;

/**
 * Counts surfaced in the campaign funnel sidebar on the activity screen.
 * `commented` is the total inbound count, the others are monotonic
 * downstream stages. All zero by default when no participants exist.
 */
export type ParticipantFunnelSummary = {
  commented: number;
  openingSent: number;
  optedIn: number;
  followed: number;
  linkSent: number;
};

// Funnel classification sets. These are the source of truth used by both the
// in-memory `computeFunnelSummary` here and the Prisma `countParticipantFunnel`
// query - sharing the constants keeps the two paths from drifting if a state
// (e.g. CANCELLED) is ever added to the enum.
export const OPTED_IN_OR_LATER_STATES = new Set<ParticipantState>([
  "OPTED_IN",
  "FOLLOW_REQUIRED",
  "FOLLOW_VERIFIED",
  "LINK_SENT",
]);
export const FOLLOWED_STATES = new Set<ParticipantState>(["FOLLOW_VERIFIED", "LINK_SENT"]);

/**
 * Derive the funnel summary from a list of participants. Lives here (not
 * in the API route) so the activity dashboard can compute the same
 * numbers from cached client data when it needs to without an extra
 * round-trip.
 */
export function computeFunnelSummary(
  participants: Pick<AutomationParticipantRecord, "state" | "openingStatus" | "followStatus" | "finalDeliveryStatus">[],
): ParticipantFunnelSummary {
  let openingSent = 0;
  let optedIn = 0;
  let followed = 0;
  let linkSent = 0;
  for (const participant of participants) {
    if (participant.openingStatus === "SENT") openingSent += 1;
    if (OPTED_IN_OR_LATER_STATES.has(participant.state as ParticipantState)) optedIn += 1;
    if (participant.followStatus === true || FOLLOWED_STATES.has(participant.state as ParticipantState)) followed += 1;
    if (participant.finalDeliveryStatus === "SENT") linkSent += 1;
  }
  return { commented: participants.length, openingSent, optedIn, followed, linkSent };
}
