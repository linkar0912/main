"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { FREE_BILLING_PLAN, getBillingPlan } from "@/src/lib/billing/catalog";
import {
  getFacebookPages,
  getInstagramConnections,
  invalidateWorkspaceResource,
  WORKSPACE_CHANGE_EVENT,
  type FacebookPageSummary,
  type InstagramConnectionSummary,
} from "@/src/lib/client/workspace-data";
import { Collapse } from "./ui/collapse";

/** Accounts shown before "Show all". */
export const SIDEBAR_ACCOUNT_LIMIT = 5;

export type SidebarAccount = {
  id: string;
  channel: "instagram" | "facebook";
  name: string;
  avatarUrl?: string;
  tone: "ok" | "warning" | "danger";
  statusLabel: string;
};

/** Connected accounts as the sidebar lists them: problems first, then by channel. */
export function sidebarAccounts(instagram: readonly InstagramConnectionSummary[], facebook: readonly FacebookPageSummary[]): SidebarAccount[] {
  const tone = (status: string): SidebarAccount["tone"] => (status === "CONNECTED" ? "ok" : status === "EXPIRED" ? "danger" : "warning");
  const label = (status: string) => (status === "CONNECTED" ? "Connected" : status === "EXPIRED" ? "Expired - reconnect" : "Disconnected - reconnect");
  const accounts: SidebarAccount[] = [
    ...instagram.map((account) => ({
      id: account.id,
      channel: "instagram" as const,
      name: `@${account.username}`,
      avatarUrl: account.profilePictureUrl ?? undefined,
      tone: tone(account.status),
      statusLabel: label(account.status),
    })),
    ...facebook.map((page) => ({
      id: page.id,
      channel: "facebook" as const,
      name: page.pageName,
      avatarUrl: page.avatarUrl,
      tone: tone(page.status),
      statusLabel: label(page.status),
    })),
  ];
  const weight = { danger: 0, warning: 1, ok: 2 } as const;
  return accounts.map((account, index) => ({ account, index }))
    .sort((a, b) => weight[a.account.tone] - weight[b.account.tone] || a.index - b.index)
    .map((entry) => entry.account);
}

/** True while the plan has room for another Instagram account or Facebook Page. */
export function canConnectMore(plan: string, instagramCount: number, facebookCount: number): boolean {
  const limits = getBillingPlan(plan) ?? FREE_BILLING_PLAN;
  return instagramCount < limits.instagramConnectionLimit || facebookCount < limits.facebookConnectionLimit;
}

function AccountAvatar({ account }: { account: SidebarAccount }) {
  const [failed, setFailed] = useState(false);
  const initial = account.name.replace(/^@/, "").charAt(0).toUpperCase() || "?";
  return (
    <span className={`sidebar-account-avatar is-${account.channel}`} aria-hidden>
      {account.avatarUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- Meta CDN avatar; decorative next to the name.
        <img src={account.avatarUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : initial}
    </span>
  );
}

/**
 * "Accounts" under the main sidebar nav: every connected Instagram account and
 * Facebook Page with a quiet status dot (amber/red with a halo when it needs a
 * reconnect). Each opens Settings → Connections focused on that account.
 */
export function SidebarAccountsSection({ plan, onNavigate }: { plan: string; onNavigate: () => void }) {
  const [instagram, setInstagram] = useState<InstagramConnectionSummary[] | null>(null);
  const [facebook, setFacebook] = useState<FacebookPageSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([getInstagramConnections(), getFacebookPages()])
      .then(([nextInstagram, nextFacebook]) => {
        if (!active) return;
        setInstagram(nextInstagram);
        setFacebook(nextFacebook);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  // A connect or disconnect elsewhere in the tab (notifyWorkspaceChanged)
  // refreshes the list right away.
  useEffect(() => {
    const onChange = () => {
      invalidateWorkspaceResource("instagram-connections");
      invalidateWorkspaceResource("facebook-pages");
      setAttempt((value) => value + 1);
    };
    window.addEventListener(WORKSPACE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(WORKSPACE_CHANGE_EVENT, onChange);
  }, []);

  const loading = !failed && (instagram === null || facebook === null);
  const accounts = sidebarAccounts(instagram ?? [], facebook ?? []);
  const visible = accounts.slice(0, SIDEBAR_ACCOUNT_LIMIT);
  const hidden = accounts.slice(SIDEBAR_ACCOUNT_LIMIT);
  const roomForMore = !loading && !failed && canConnectMore(plan, instagram?.length ?? 0, facebook?.length ?? 0);

  const row = (account: SidebarAccount) => (
    <li key={`${account.channel}:${account.id}`}>
      <Link
        className="sidebar-account-link"
        href={`/settings?account=${encodeURIComponent(account.id)}`}
        title={`${account.name} · ${account.channel === "instagram" ? "Instagram" : "Facebook Page"} · ${account.statusLabel}`}
        onClick={onNavigate}
      >
        <AccountAvatar account={account} />
        <span className="sidebar-account-name">{account.name}</span>
        <span className="sidebar-account-status" data-tone={account.tone}>
          <span className="sr-only">{account.channel === "instagram" ? "Instagram account" : "Facebook Page"}, {account.statusLabel.toLowerCase()}</span>
        </span>
      </Link>
    </li>
  );

  return (
    <section className="sidebar-accounts" aria-labelledby="sidebar-accounts-heading">
      <h2 className="sidebar-label" id="sidebar-accounts-heading">Accounts</h2>
      {loading ? (
        <div className="sidebar-accounts-loading" aria-hidden>
          <span className="skeleton-block" />
          <span className="skeleton-block" />
        </div>
      ) : failed ? (
        <p className="sidebar-accounts-note">
          Could not load accounts.{" "}
          <button className="text-link" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
        </p>
      ) : (
        <>
          {accounts.length > 0 ? <ul className="sidebar-accounts-list">{visible.map(row)}</ul> : null}
          {hidden.length > 0 ? (
            <>
              <Collapse open={showAll} id="sidebar-accounts-more">
                {showAll && <ul className="sidebar-accounts-list">{hidden.map(row)}</ul>}
              </Collapse>
              <button
                className="sidebar-accounts-more"
                type="button"
                aria-expanded={showAll}
                aria-controls={showAll ? "sidebar-accounts-more" : undefined}
                onClick={() => setShowAll((value) => !value)}
              >
                <ChevronDown size={15} strokeWidth={2} aria-hidden />
                {showAll ? "Show fewer" : `Show all ${accounts.length}`}
              </button>
            </>
          ) : null}
          {roomForMore ? (
            <Link className="sidebar-accounts-connect" href="/settings" onClick={onNavigate}>
              <Plus size={15} strokeWidth={2} aria-hidden />
              Connect account
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}
