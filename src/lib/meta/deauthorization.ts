import type { AutomationRepository } from "../repository";
import { parseSignedRequest } from "./data-deletion";

export type DeauthorizationResult =
  | { ok: true; instagramUserId: string }
  | { ok: false; reason: "invalid-signed-request" };

export async function processDeauthorization(
  signedRequest: string,
  appSecret: string,
  repository: AutomationRepository,
): Promise<DeauthorizationResult> {
  const payload = parseSignedRequest(signedRequest, appSecret);
  if (!payload) return { ok: false, reason: "invalid-signed-request" };

  await repository.expireParticipantsByInstagramAccount(payload.user_id, "Instagram account deauthorized");
  await repository.deleteConnectionByInstagramAccount(payload.user_id);
  return { ok: true, instagramUserId: payload.user_id };
}
