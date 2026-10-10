"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  KeyRound,
  Link2,
  LogOut,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { useAccountIdentity } from "./app-shell";
import { InlineConfirm } from "./inline-confirm";
import { Skeleton } from "./skeleton";
import { PageHeader } from "./page-header";
import { SocialAvatar } from "./social-avatar";
import type { ConnectionStatus, MemberRole } from "@/src/lib/repository";
import { formatDate } from "@/src/lib/format-date";
import { friendlyFirstName } from "@/src/lib/display-name";
import {
  getAccountProfile,
  getFacebookPages,
  getInstagramConnections,
  type AccountProfile,
  type FacebookPageSummary,
} from "@/src/lib/client/workspace-data";

type Connection = {
  id: string;
  igUserId: string;
  username: string;
  status: ConnectionStatus;
  connectedAt: string;
  profilePictureUrl?: string | null;
};

/**
 * Every field is optional: the route renders `<ProfileScreen />` with no props
 * so /profile stays a static client page (instant shell, exactly like
 * /automations) instead of a force-dynamic server page that blocks the whole
 * navigation on a Supabase getUser() round trip. Passing props still works and
 * short-circuits the client fetch, which keeps the component testable and
 * leaves the door open for a server-rendered caller.
 */
type ProfileScreenProps = {
  email?: string;
  memberSince?: string | null;
  emailVerified?: boolean;
  role?: MemberRole;
};

/** One letter from the friendly name; a person glyph stands in otherwise. */
function initialsOf(email: string): string {
  return friendlyFirstName(email)?.charAt(0).toUpperCase() ?? "";
}

/** "Tejastelkar" for tejastelkar9@..., never the raw handle with its digits. */
function displayNameFromEmail(email: string): string {
  return friendlyFirstName(email) ?? "Your account";
}

function roleLabel(role: MemberRole): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function planLabel(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function savedMessageFor(saved: string | null): string {
  if (saved === "password") return "Password updated. Use it next time you sign in.";
  if (saved === "verification-sent") return "Verification email sent - check your inbox.";
  if (saved === "already-verified") return "Your email is already verified.";
  return "";
}

function accountErrorFor(error: string | null): string {
  if (error === "current") return "That current password is incorrect.";
  if (error === "password") return "The new password must be at least 12 characters.";
  if (error === "verify-rate-limited") return "Too many verification emails requested. Try again in a while.";
  if (error === "unknown") return "That action is not available.";
  return "";
}

export function ProfileScreen(props: ProfileScreenProps = {}) {
  return (
    <>
      <ProfileBody {...props} />
    </>
  );
}

function ProfileBody({
  email: emailProp,
  memberSince: memberSinceProp,
  emailVerified: emailVerifiedProp,
  role: roleProp,
}: ProfileScreenProps) {
  // The sidebar already fetched email/role/plan for its own chip; reading them
  // from that shared context means the profile header paints without waiting
  // for a second round trip of its own.
  const identity = useAccountIdentity();
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [facebookPages, setFacebookPages] = useState<FacebookPageSummary[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  // The redirect from /api/account carries feedback in the query string.
  // useSearchParams (rather than reading window.location during render) is
  // Next's own hydration-safe way to read it - server and client agree on
  // the value from the first render, no reconciliation needed.
  const searchParams = useSearchParams();
  const savedMessage = dismissed ? "" : savedMessageFor(searchParams.get("accountSaved"));
  const accountError = accountErrorFor(searchParams.get("accountError"));

  // Auto-dismiss the success banner after a short pause.
  useEffect(() => {
    if (!savedMessage) return;
    const timer = setTimeout(() => setDismissed(true), 4000);
    return () => clearTimeout(timer);
  }, [savedMessage]);

  // memberSince and emailVerified are the only two facts the shell bootstrap
  // doesn't already carry, so they - and nothing else - wait on /api/account.
  const serverSupplied = emailProp !== undefined;
  useEffect(() => {
    if (serverSupplied) return;
    let mounted = true;
    getAccountProfile()
      .then((data) => {
        if (mounted) setAccount(data);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [serverSupplied]);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      getInstagramConnections().catch(() => []),
      getFacebookPages().catch(() => []),
    ]).then(([instagram, facebook]) => {
      if (!mounted) return;
      setConnections(instagram);
      setFacebookPages(facebook);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const email = emailProp ?? account?.email ?? identity.email;
  const role: MemberRole | null = roleProp ?? account?.role ?? (identity.role || null);
  const memberSince = serverSupplied ? memberSinceProp ?? null : account?.memberSince ?? null;
  // null means "not known yet" - claiming Unverified (and offering the resend
  // form) before the answer arrives would be wrong for a verified account.
  const emailVerified: boolean | null = emailVerifiedProp ?? account?.emailVerified ?? null;
  const plan = account?.planName ?? (identity.plan ? planLabel(identity.plan) : "Free");

  // Every connected account is listed; the first Instagram account with a
  // photo stands in as the profile picture.
  const hasChannel = connections.length > 0 || facebookPages.length > 0;
  const avatar = connections.find((connection) => connection.profilePictureUrl)?.profilePictureUrl ?? undefined;

  function channelStatusLabel(status: ConnectionStatus): string {
    return status === "CONNECTED" ? "Connected" : status === "EXPIRED" ? "Token expired" : "Disconnected";
  }

  return (
    <div className="page-wrap profile-wrap ws-page">
      <PageHeader
        title="My profile"
        description="Your account details, password and connected channels."
      />

      {savedMessage && (
        <div className="notice-banner notice-success" role="status">
          <BadgeCheck size={17} />
          <p>{savedMessage}</p>
        </div>
      )}
      {accountError && (
        <div className="notice-banner notice-warning" role="alert">
          <p>{accountError}</p>
        </div>
      )}

      <section className="settings-group profile-identity" aria-label="Profile identity">
        <div className="profile-identity-top">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- Meta CDN avatar; next/image adds no value for one remote photo.
            <img className="avatar profile-avatar is-photo" src={avatar} alt="" />
          ) : email ? (
            <span className="avatar profile-avatar" aria-hidden>{initialsOf(email) || <UserRound size={22} strokeWidth={1.8} />}</span>
          ) : (
            <Skeleton className="profile-avatar" style={{ borderRadius: "50%" }} />
          )}
          <div className="profile-identity-name">
            {email ? (
              <>
                <h2>{displayNameFromEmail(email)}</h2>
                <small>{email}</small>
              </>
            ) : (
              <>
                <Skeleton style={{ height: 22, marginBottom: 6, width: 180 }} />
                <Skeleton style={{ height: 13, width: 220 }} />
              </>
            )}
          </div>
          <span className="plan-tag profile-plan-tag">{plan}</span>
        </div>
        <dl className="profile-facts">
          <div>
            <dt>Workspace role</dt>
            <dd data-tone="accent">{role ? roleLabel(role) : <Skeleton style={{ height: 15, width: 62 }} />}</dd>
          </div>
          <div>
            <dt>Current plan</dt>
            <dd>{plan}</dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{memberSince ? formatDate(memberSince) : <Skeleton style={{ height: 15, width: 92 }} />}</dd>
          </div>
          <div>
            <dt>Email status</dt>
            <dd data-tone={emailVerified === null ? undefined : emailVerified ? "ok" : "warn"}>
              {emailVerified === null ? <Skeleton style={{ height: 15, width: 70 }} /> : emailVerified ? <><BadgeCheck size={14} /> Verified</> : "Unverified"}
            </dd>
          </div>
        </dl>
        {emailVerified === false && (
          <form action="/api/account" method="post" className="settings-row settings-row-split profile-verify-row">
            <input type="hidden" name="action" value="resend-verification" />
            <span className="settings-row-copy">
              <strong>Confirm your email</strong>
              <small>Keep full access to your workspace by verifying {email}.</small>
            </span>
            <button className="button button-secondary button-small" type="submit">Resend email</button>
          </form>
        )}
      </section>

      <div className="profile-columns">
        <section className="profile-column" aria-label="Account actions">
          <section className="settings-group" aria-label="Password">
            <div className="settings-group-head">
              <span className="settings-group-icon"><KeyRound size={18} /></span>
              <div className="settings-group-copy">
                <h3>Password</h3>
                <p>Use at least 12 characters. Changing it keeps your other devices signed in.</p>
              </div>
            </div>
            <form action="/api/account" method="post" className="profile-password-form">
              <input type="hidden" name="action" value="change-password" />
              <div className="settings-row profile-password-fields">
                <label className="field">
                  <span>Current password</span>
                  <input name="currentPassword" type="password" autoComplete="current-password" required />
                </label>
                <label className="field">
                  <span>New password</span>
                  <input name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
                </label>
              </div>
              <div className="settings-group-foot">
                <span />
                <button className="button button-primary button-small" type="submit">
                  Update password
                </button>
              </div>
            </form>
          </section>

          <section className="settings-group" aria-label="Sessions">
            <div className="settings-group-head">
              <span className="settings-group-icon"><ShieldCheck size={18} /></span>
              <div className="settings-group-copy">
                <h3>Sessions</h3>
                <p>Control where you are signed in.</p>
              </div>
            </div>
            <form action="/api/account" method="post" className="settings-row settings-row-split">
              <input type="hidden" name="action" value="logout-all" />
              <span className="settings-row-copy">
                <strong>Sign out everywhere</strong>
                <small>Ends every session on all your devices, including this one.</small>
              </span>
              <button className="button button-secondary button-small" type="button" aria-expanded={confirmingSignOut} onClick={() => setConfirmingSignOut(true)}>
                <LogOut size={14} aria-hidden /> Sign out all
              </button>
              {confirmingSignOut ? (
                <InlineConfirm
                  label="Confirm signing out everywhere"
                  message="Sign out on every device, including this one? You will need your password to sign back in."
                  confirmLabel="Sign out everywhere"
                  confirmType="submit"
                  onCancel={() => setConfirmingSignOut(false)}
                />
              ) : null}
            </form>
          </section>
        </section>

        <aside className="profile-column" aria-label="Profile supporting information">
          <section className="settings-group profile-channels" aria-labelledby="profile-channels-title">
            <div className="settings-group-head">
              <span className="settings-group-icon"><Link2 size={18} /></span>
              <div className="settings-group-copy">
                <h3 id="profile-channels-title">Connected channels</h3>
                <p>{hasChannel ? "Accounts replying on your behalf." : "Nothing connected yet."}</p>
              </div>
            </div>
            <ul className="settings-rows">
              {connections.length > 0 ? connections.map((connection) => (
                <li className="settings-row profile-channel-row" key={connection.id}>
                  <SocialAvatar channel="instagram" name={`@${connection.username}`} src={connection.profilePictureUrl ?? undefined} />
                  <span className="settings-row-copy">
                    <strong>@{connection.username}</strong>
                    <small className="connection-status" role="status" aria-label={`Instagram ${connection.status.toLowerCase()}`}>
                      <span className={`signal-dot status-dot-${connection.status.toLowerCase()}`} />
                      Instagram, {channelStatusLabel(connection.status).toLowerCase()} since {formatDate(connection.connectedAt)}
                    </small>
                  </span>
                </li>
              )) : (
                <li className="settings-row profile-channel-row">
                  <span className="settings-row-copy"><strong>Instagram</strong><small>No Instagram account connected yet.</small></span>
                </li>
              )}
              {facebookPages.length > 0 ? facebookPages.map((facebookPage) => (
                <li className="settings-row profile-channel-row" key={facebookPage.id}>
                  <SocialAvatar channel="facebook" name={facebookPage.pageName} src={facebookPage.avatarUrl} />
                  <span className="settings-row-copy">
                    <strong>{facebookPage.pageName}</strong>
                    <small className="connection-status" role="status" aria-label={`Facebook ${facebookPage.status.toLowerCase()}`}>
                      <span className={`signal-dot status-dot-${facebookPage.status.toLowerCase()}`} />
                      Facebook Page, {channelStatusLabel(facebookPage.status).toLowerCase()}
                    </small>
                  </span>
                </li>
              )) : (
                <li className="settings-row profile-channel-row">
                  <span className="settings-row-copy"><strong>Facebook</strong><small>No Facebook Page connected yet.</small></span>
                </li>
              )}
            </ul>
            <div className="settings-group-foot">
              <span />
              <Link className={`button ${hasChannel ? "button-secondary" : "button-primary"} button-small`} href="/settings">
                {hasChannel ? "Manage channels" : "Connect a channel"}
              </Link>
            </div>
          </section>

          <section className="settings-group" aria-label="Workspace links">
            <ul className="settings-rows settings-link-list">
              {[
                ["/settings?section=team", "Team & invitations", Users],
                ["/help", "Help centre", CircleHelp],
                ["/privacy", "Privacy policy", ExternalLink],
                ["/data-deletion", "Data deletion", ExternalLink],
              ].map(([href, label, Icon]) => {
                const LinkIcon = Icon as typeof Users;
                return (
                  <li key={label as string}>
                    <Link className="settings-row settings-link-row" href={href as string}>
                      <span className="settings-row-copy"><strong><LinkIcon size={15} /> {label as string}</strong></span>
                      <ChevronRight size={16} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
