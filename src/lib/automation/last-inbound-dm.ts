import type { AutomationRepository } from "../repository";

/**
 * When this person last messaged the account (a DM, quick reply, button tap or
 * story mention), or undefined when no such message is on record. Every
 * window check reads undefined as closed.
 *
 * These are the inbound events that maintain AutomationContact.lastInboundAt
 * (the contact_last_inbound migration's triggers), the field that chooses
 * broadcast recipients, so the send-time re-check agrees with the recipient
 * query. The contact's lastSeenAt is deliberately not used: comment events and
 * the Contacts screen's participant sync move it forward, and neither opens
 * Meta's 24-hour messaging window.
 */
export async function lastInboundDmAt(
  repository: Pick<AutomationRepository, "listInboundEventsForRecipient">,
  workspaceId: string,
  instagramAccountId: string,
  igScopedUserId: string,
): Promise<string | undefined> {
  const page = await repository.listInboundEventsForRecipient(
    workspaceId,
    instagramAccountId,
    igScopedUserId,
    { limit: 1 },
  );
  return page.records[0]?.receivedAt;
}
