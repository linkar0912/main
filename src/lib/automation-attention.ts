/**
 * Why one automation needs its owner, for the "Needs attention" group on the
 * Automations list and the line at the top of an automation's Overview.
 *
 * Home's list (src/lib/home-attention.ts) answers the same question for the
 * whole workspace; this narrows it to one automation and reuses its
 * vocabulary (tones, chips, the 7-day failure window), so a problem reads the
 * same wherever it surfaces.
 */
import { RECENT_FAILURE_WINDOW_MS, type AttentionTone } from "./home-attention";

export type AttentionReason = "reconnect" | "connect" | "failures";

export type AutomationAttention = {
  reason: AttentionReason;
  tone: AttentionTone;
  /** One or two words for the chip. */
  chip: string;
  /** One plain sentence: what is wrong and what it costs. */
  text: string;
  /** The same in a few words, for a list row: "@studio.kavya needs reconnecting". */
  short: string;
  /** The one action that fixes it: "Reconnect", "Connect", "Fix". */
  actionLabel: string;
};

type ConnectionState = "CONNECTED" | "DISCONNECTED" | "EXPIRED";

export type AttentionAutomation = {
  id: string;
  status: string;
  provider?: string;
  instagramAccountId?: string | null;
  facebookPageId?: string | null;
};

export type AutomationAttentionInput = {
  /** null while unknown: never claim "not connected" before the answer arrives. */
  instagram: Array<{ igUserId: string; username: string; status: ConnectionState }> | null;
  facebook: Array<{ pageId: string; pageName: string; status: ConnectionState }> | null;
  /** Recent delivery problems (GET /api/automations/deliveries); null while unknown. */
  failures: Array<{ automationId?: string; updatedAt: string }> | null;
  now?: number;
};

function count(value: number): string {
  return value.toLocaleString("en-IN");
}

export function isFacebookAutomation(automation: Pick<AttentionAutomation, "provider" | "facebookPageId">): boolean {
  return automation.provider === "FACEBOOK" || Boolean(automation.facebookPageId);
}

/** The connection problem that stops this automation replying, if any. */
function connectionAttention(automation: AttentionAutomation, input: AutomationAttentionInput): AutomationAttention | null {
  if (isFacebookAutomation(automation)) {
    if (!input.facebook) return null;
    const page = input.facebook.find((candidate) => candidate.pageId === automation.facebookPageId);
    if (!page) {
      return {
        reason: "connect",
        tone: "danger",
        chip: "Not connected",
        text: "Its Facebook Page isn't connected any more, so it can't reply.",
        short: "Facebook Page not connected",
        actionLabel: "Connect",
      };
    }
    if (page.status === "CONNECTED") return null;
    return {
      reason: "reconnect",
      tone: "danger",
      chip: page.status === "EXPIRED" ? "Expired" : "Disconnected",
      text: `${page.pageName} needs reconnecting. Nothing replies on it until you do.`,
      short: `${page.pageName} needs reconnecting`,
      actionLabel: "Reconnect",
    };
  }

  if (!input.instagram) return null;
  if (automation.instagramAccountId) {
    const account = input.instagram.find((candidate) => candidate.igUserId === automation.instagramAccountId);
    if (!account) {
      return {
        reason: "connect",
        tone: "danger",
        chip: "Not connected",
        text: "The Instagram account it runs on isn't connected any more, so it can't reply.",
        short: "Instagram account not connected",
        actionLabel: "Connect",
      };
    }
    if (account.status === "CONNECTED") return null;
    return {
      reason: "reconnect",
      tone: "danger",
      chip: account.status === "EXPIRED" ? "Expired" : "Disconnected",
      text: `@${account.username.replace(/^@/, "")} needs reconnecting. Nothing replies on it until you do.`,
      short: `@${account.username.replace(/^@/, "")} needs reconnecting`,
      actionLabel: "Reconnect",
    };
  }
  // Not pinned: it runs on every connected account, so it is only stuck when
  // none of them can send.
  if (input.instagram.length === 0) {
    return {
      reason: "connect",
      tone: "danger",
      chip: "Not connected",
      text: "Connect Instagram so this automation can reply.",
      short: "Instagram not connected",
      actionLabel: "Connect",
    };
  }
  const working = input.instagram.some((account) => account.status === "CONNECTED");
  if (working) return null;
  const first = input.instagram[0];
  return {
    reason: "reconnect",
    tone: "danger",
    chip: first.status === "EXPIRED" ? "Expired" : "Disconnected",
    text: `@${first.username.replace(/^@/, "")} needs reconnecting. Nothing replies on it until you do.`,
    short: `@${first.username.replace(/^@/, "")} needs reconnecting`,
    actionLabel: "Reconnect",
  };
}

/** Messages this automation couldn't send inside Home's 7-day failure window. */
export function recentFailureCount(automationId: string, failures: AutomationAttentionInput["failures"], now = Date.now()): number {
  return (failures ?? []).filter((failure) => {
    if (failure.automationId !== automationId) return false;
    const time = Date.parse(failure.updatedAt);
    return Number.isFinite(time) && now - time <= RECENT_FAILURE_WINDOW_MS;
  }).length;
}

/**
 * The most pressing problem with a live automation, or null when it is fine.
 * Drafts and paused automations aren't replying by choice, so nothing about
 * them is urgent; they keep their own groups.
 */
export function automationAttention(automation: AttentionAutomation, input: AutomationAttentionInput): AutomationAttention | null {
  if (automation.status !== "ACTIVE") return null;
  const connection = connectionAttention(automation, input);
  if (connection) return connection;
  const failed = recentFailureCount(automation.id, input.failures, input.now);
  if (failed > 0) {
    return {
      reason: "failures",
      tone: "warning",
      chip: "Failed",
      text: failed === 1
        ? "1 message couldn't be sent in the last 7 days."
        : `${count(failed)} messages couldn't be sent in the last 7 days.`,
      short: failed === 1 ? "1 message failed in 7 days" : `${count(failed)} messages failed in 7 days`,
      actionLabel: "Fix",
    };
  }
  return null;
}
