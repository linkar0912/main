import type { AutomationRepository } from "../repository";
import { parseSignedRequest } from "../meta/data-deletion";

export type FacebookDeauthorizationResult =
  | { ok: true; facebookUserId: string }
  | { ok: false; reason: "invalid-signed-request" };

export async function processFacebookDeauthorization(
  signedRequest: string,
  appSecret: string,
  repository: AutomationRepository,
): Promise<FacebookDeauthorizationResult> {
  const payload = parseSignedRequest(signedRequest, appSecret);
  if (!payload) return { ok: false, reason: "invalid-signed-request" };
  await repository.deleteFacebookPagesByUserId(payload.user_id);
  return { ok: true, facebookUserId: payload.user_id };
}
