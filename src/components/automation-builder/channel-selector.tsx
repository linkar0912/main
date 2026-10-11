import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { FacebookPageSummary } from "@/src/lib/client/workspace-data";
import { FacebookGlyph } from "../facebook-glyph";
import { InstagramGlyph } from "../instagram-glyph";
import { ChoiceCards, Field, FieldError } from "./wizard";

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
  error,
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
  /** Inline validation for the account/Page choice. */
  error?: string | null;
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
  const onlyAccount = instagramAccounts.length === 1 ? (selectedAccount ?? instagramAccounts[0]) : undefined;

  return (
    <div className="channel-selector" role="group" aria-label="Automation target">
      <ChoiceCards
        legend="Channel"
        name="automation-channel"
        className="is-compact"
        value={channel}
        onChange={onChannelChange}
        options={[
          { value: "INSTAGRAM", label: "Instagram", description: "Comments, DMs and Stories", icon: <InstagramGlyph size={20} brand /> },
          { value: "FACEBOOK", label: "Facebook Page", description: "Comments on your Page posts", icon: <FacebookGlyph size={20} brand /> },
        ]}
      />

      {channel === "INSTAGRAM" && instagramAccounts.length > 1 && (
        <Field label="Instagram account">
          <select value={instagramAccountId} onChange={(event) => onInstagramAccountChange(event.target.value)}>
            {instagramAccounts.map((item) => (
              <option key={item.igUserId} value={item.igUserId}>
                @{item.username}{item.status && item.status !== "CONNECTED" ? " (reconnect needed)" : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      {channel === "INSTAGRAM" && onlyAccount && (
        <p className="channel-account-line" data-testid="instagram-account-used">
          Runs on <strong>@{onlyAccount.username}</strong>
          {onlyAccount.status && onlyAccount.status !== "CONNECTED" ? " (reconnect needed)" : ""}
        </p>
      )}

      {channel === "INSTAGRAM" && instagramLoaded && instagramAccounts.length === 0 && (
        <p className="builder-callout is-warning" role="status">
          <AlertTriangle size={16} aria-hidden />
          <span>No Instagram account is connected yet. <Link className="text-link" href="/settings">Connect an Instagram account</Link> to save this automation.</span>
        </p>
      )}

      {channel === "FACEBOOK" && pageOptions.length > 0 && (
        <Field label="Facebook Page">
          <select value={facebookPageId} onChange={(event) => onFacebookPageChange(event.target.value)}>
            <option value="">Select a connected Page</option>
            {pageOptions.map((page) => (
              <option key={page.id} value={page.pageId} disabled={page.status !== "CONNECTED" && page.pageId !== facebookPageId}>
                {page.pageName}{page.status !== "CONNECTED" ? " (not connected)" : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      {channel === "FACEBOOK" && facebookLoaded && connectedPages.length === 0 && (
        <p className="builder-callout is-warning" role="status">
          <AlertTriangle size={16} aria-hidden />
          <span>No Facebook Page is connected yet. <Link className="text-link" href="/settings">Connect a Facebook Page</Link> to build Page automations.</span>
        </p>
      )}
      <FieldError message={error} />
    </div>
  );
}
