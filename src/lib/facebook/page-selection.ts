import { sealSecret, unsealSecret } from "../security/secrets";

export const FACEBOOK_PAGE_SELECTION_COOKIE = "linkar_facebook_page_selection";

export type FacebookPageSelection = {
  workspaceId: string;
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
  now = Date.now(),
): FacebookPageSelection | null {
  try {
    const value = JSON.parse(unsealSecret(sealed, encryptionKey)) as Partial<FacebookPageSelection>;
    if (
      value.workspaceId !== workspaceId
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
