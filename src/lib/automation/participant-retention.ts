import type { AutomationRepository } from "../repository";

export const PARTICIPANT_RETENTION_MS = 90 * 24 * 60 * 60 * 1_000;

export async function sweepStaleParticipants(
  repository: AutomationRepository,
  now = new Date(),
): Promise<{ expired: number; deleted: number }> {
  const expired = await repository.expireStaleParticipants(now.toISOString(), "Messaging window expired");
  const before = new Date(now.getTime() - PARTICIPANT_RETENTION_MS).toISOString();
  const deleted = await repository.deleteStaleTerminalParticipants(before);
  // Webhook activity shares the same 90-day retention window as participants.
  await repository.deleteOldWebhookEvents(before);
  return { expired, deleted };
}

