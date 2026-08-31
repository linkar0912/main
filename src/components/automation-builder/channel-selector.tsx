import type { FacebookPageSummary } from "@/src/lib/client/workspace-data";

type InstagramConnectionSummary = {
  username: string;
  igUserId: string;
};

export function ChannelSelector({
  channel,
  instagramAccountId,
  facebookPageId,
  instagramConnections,
  facebookPages,
  onChannelChange,
  onInstagramAccountChange,
  onFacebookPageChange,
}: {
  channel: "INSTAGRAM" | "FACEBOOK";
  instagramAccountId: string;
  facebookPageId: string;
  instagramConnections: InstagramConnectionSummary[];
  facebookPages: FacebookPageSummary[];
  onChannelChange: (channel: "INSTAGRAM" | "FACEBOOK") => void;
  onInstagramAccountChange: (accountId: string) => void;
  onFacebookPageChange: (pageId: string) => void;
}) {
  return (
    <div className="channel-selector" aria-label="Automation target">
      <label className="field field-wide">
        <span>Channel</span>
        <select aria-label="Channel" value={channel} onChange={(event) => onChannelChange(event.target.value as "INSTAGRAM" | "FACEBOOK")}>
          <option value="INSTAGRAM">Instagram</option>
          <option value="FACEBOOK">Facebook Page</option>
        </select>
      </label>

      {channel === "INSTAGRAM" && instagramConnections.length > 1 && (
        <label className="field field-wide">
          <span>Instagram account</span>
          <select aria-label="Instagram account" value={instagramAccountId} onChange={(event) => onInstagramAccountChange(event.target.value)}>
            <option value="">All connected accounts</option>
            {instagramConnections.map((item) => (
              <option key={item.igUserId || item.username} value={item.igUserId}>@{item.username}</option>
            ))}
          </select>
        </label>
      )}

      {facebookPages.length > 0 && (
        <label className="field field-wide">
          <span>Facebook Page</span>
          <select aria-label="Facebook Page" value={facebookPageId} onChange={(event) => onFacebookPageChange(event.target.value)}>
            <option value="">Select a connected Page</option>
            {facebookPages.map((page) => (
              <option key={page.id} value={page.pageId}>{page.pageName}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
