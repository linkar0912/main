import { sealSecret, unsealSecret } from "../security/secrets";

export const FACEBOOK_PAGE_SELECTION_COOKIE = "linkar_facebook_page_selection";

/**
 * A Facebook grant waiting for its Page to be picked. It holds the person's
 * Facebook token, so only the Linkar user who granted it, in the same
 * workspace, may read it: not another member on a shared browser.
 */
export type FacebookPageSelection = {
  workspaceId: string;
  userId: string;
  facebookUserId: string;
  userAccessToken: string;
  tokenExpiresAt?: string;
  selectionExpiresAt: string;
};

export function createFacebookPageSelection(value: FacebookPageSelection, encryptionKey: string): string {
  return sealSecret(JSON.stringify(value), encryptionKey);
}

export function readFacebookPageSelection(
  sealed: string,
  encryptionKey: string,
  workspaceId: string,
  userId: string,
  now = Date.now(),
): FacebookPageSelection | null {
  try {
    const value = JSON.parse(unsealSecret(sealed, encryptionKey)) as Partial<FacebookPageSelection>;
    if (
      value.workspaceId !== workspaceId
      || typeof value.userId !== "string"
      || value.userId !== userId
      || typeof value.facebookUserId !== "string"
      || typeof value.userAccessToken !== "string"
      || typeof value.selectionExpiresAt !== "string"
      || Date.parse(value.selectionExpiresAt) <= now
    ) return null;
    return value as FacebookPageSelection;
  } catch {
    return null;
  }
}
