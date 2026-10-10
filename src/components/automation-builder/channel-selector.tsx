import Link from "next/link";
import type { FacebookPageSummary } from "@/src/lib/client/workspace-data";

type InstagramConnectionSummary = {
  username: string;
  igUserId: string;
  status?: string;
};

export function ChannelSelector({
  channel,
  instagramAccountId,
  facebookPageId,
  instagramConnections,
  instagramLoaded = true,
  facebookPages,
  facebookLoaded = true,
  onChannelChange,
  onInstagramAccountChange,
  onFacebookPageChange,
}: {
  channel: "INSTAGRAM" | "FACEBOOK";
  /** The account the automation will actually be pinned to (already defaulted by the builder). */
  instagramAccountId: string;
  facebookPageId: string;
  instagramConnections: InstagramConnectionSummary[];
  instagramLoaded?: boolean;
  facebookPages: FacebookPageSummary[];
  facebookLoaded?: boolean;
  onChannelChange: (channel: "INSTAGRAM" | "FACEBOOK") => void;
  onInstagramAccountChange: (accountId: string) => void;
  onFacebookPageChange: (pageId: string) => void;
}) {
  const instagramAccounts = instagramConnections.filter((item) => item.igUserId);
  const selectedAccount = instagramAccounts.find((item) => item.igUserId === instagramAccountId);
  // Only live Pages can be picked; a disconnected Page that an existing
  // automation is already pinned to stays listed (and labelled) so the select
  // doesn't silently show a blank value.
  const connectedPages = facebookPages.filter((page) => page.status === "CONNECTED");
  const pinnedInactivePage = facebookPageId
    ? facebookPages.find((page) => page.pageId === facebookPageId && page.status !== "CONNECTED")
    : undefined;
  const pageOptions = pinnedInactivePage ? [...connectedPages, pinnedInactivePage] : connectedPages;

  return (
    <div className="channel-selector" role="group" aria-label="Automation target">
      <label className="field field-wide">
        <span>Channel</span>
        <select aria-label="Channel" value={channel} onChange={(event) => onChannelChange(event.target.value as "INSTAGRAM" | "FACEBOOK")}>
          <option value="INSTAGRAM">Instagram</option>
          <option value="FACEBOOK">Facebook Page</option>
        </select>
      </label>

      {channel === "INSTAGRAM" && instagramAccounts.length > 1 && (
        <label className="field field-wide">
          <span>Instagram account</span>
          <select aria-label="Instagram account" value={instagramAccountId} onChange={(event) => onInstagramAccountChange(event.target.value)}>
            {instagramAccounts.map((item) => (
              <option key={item.igUserId} value={item.igUserId}>
                @{item.username}{item.status && item.status !== "CONNECTED" ? " (reconnect needed)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {channel === "INSTAGRAM" && instagramAccounts.length === 1 && (
        <p className="field field-wide muted" data-testid="instagram-account-used">
          Runs on @{selectedAccount?.username ?? instagramAccounts[0].username}
          {instagramAccounts[0].status && instagramAccounts[0].status !== "CONNECTED" ? " (reconnect needed)" : ""}
        </p>
      )}

      {channel === "INSTAGRAM" && instagramLoaded && instagramAccounts.length === 0 && (
        <p className="form-warning field-wide" role="status">
          No Instagram account is connected yet. <Link className="text-link" href="/settings">Connect an Instagram account</Link> to save this automation.
        </p>
      )}

      {pageOptions.length > 0 && (
        <label className="field field-wide">
          <span>Facebook Page</span>
          <select aria-label="Facebook Page" value={facebookPageId} onChange={(event) => onFacebookPageChange(event.target.value)}>
            <option value="">Select a connected Page</option>
            {pageOptions.map((page) => (
              <option key={page.id} value={page.pageId} disabled={page.status !== "CONNECTED" && page.pageId !== facebookPageId}>
                {page.pageName}{page.status !== "CONNECTED" ? " (not connected)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {channel === "FACEBOOK" && facebookLoaded && connectedPages.length === 0 && (
        <p className="form-warning field-wide" role="status">
          No Facebook Page is connected yet. <Link className="text-link" href="/settings">Connect a Facebook Page</Link> to build Page automations.
        </p>
      )}
    </div>
  );
}
