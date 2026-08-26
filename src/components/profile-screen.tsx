"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  CircleHelp,
  ExternalLink,
  KeyRound,
  Link2,
  LogOut,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { InstagramGlyph } from "./instagram-glyph";
import type { ConnectionStatus, MemberRole } from "@/src/lib/repository";
import { formatDate } from "@/src/lib/format-date";
import { getInstagramConnections } from "@/src/lib/client/workspace-data";

type Connection = {
  id: string;
  igUserId: string;
  username: string;
  status: ConnectionStatus;
  connectedAt: string;
  profilePictureUrl?: string | null;
};

type ProfileScreenProps = {
  email: string;
  memberSince: string | null;
  emailVerified: boolean;
  role: MemberRole;
};

function initialsOf(email: string): string {
  const handle = email.split("@")[0] ?? "";
  const cleaned = handle.replace(/[^a-zA-Z0-9]/g, " ").trim();
  if (!cleaned) return "OW";
  if (cleaned.includes(" ")) {
    return cleaned.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  }
  return cleaned.slice(0, 2).toUpperCase();
}

function displayNameFromEmail(email: string): string {
  const handle = email.split("@")[0] ?? "";
  const cleaned = handle.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!cleaned) return "Workspace owner";
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function roleLabel(role: MemberRole): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
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

export function ProfileScreen({ email, memberSince, emailVerified, role }: ProfileScreenProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [dismissed, setDismissed] = useState(false);
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

  useEffect(() => {
    getInstagramConnections()
      .then((data) => setConnections(data))
      .catch(() => undefined);
  }, []);

  const connection = connections[0];
  const avatar = connection?.profilePictureUrl ?? undefined;

  return (
    <AppShell>
      <div className="page-wrap profile-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>My Profile</h1>
            <p className="muted page-lede">Your identity, security, and connected Instagram account in one place.</p>
          </div>
        </header>

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

        <section className="panel profile-card profile-hero" aria-label="Account summary">
          <div className="profile-hero-main">
            <div className="profile-hero-identity">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- Meta CDN avatar; next/image adds no value for one remote photo.
                <img className="avatar avatar-large is-photo" src={avatar} alt="" />
              ) : (
                <span className="avatar avatar-large" aria-hidden>{initialsOf(email)}</span>
              )}
              <div className="account-summary-id">
                <p className="eyebrow">Personal details</p>
                <h2>{displayNameFromEmail(email)}</h2>
                <small>{email}</small>
                <span className="account-summary-meta">
                  {memberSince ? `Joined ${formatDate(memberSince)}` : "Workspace member"}
                </span>
              </div>
            </div>
            <div className="account-summary-chips">
              <span className="profile-chip" data-tone="accent">{roleLabel(role)}</span>
              <span className="profile-chip">Free plan</span>
              <span className="profile-chip" data-tone={emailVerified ? "ok" : "warn"}>
                {emailVerified ? "Email verified" : "Email unverified"}
              </span>
            </div>
            {!emailVerified && (
              <form action="/api/account" method="post" className="account-verify-row">
                <input type="hidden" name="action" value="resend-verification" />
                <p className="muted">Confirm your email to keep full access to your workspace.</p>
                <button className="button button-secondary" type="submit">
                  Resend verification email
                </button>
              </form>
            )}
          </div>

          <div className="profile-hero-channel">
            <div className="panel-heading">
              <div><p className="eyebrow">Active channel</p><h2>Instagram</h2></div>
              <InstagramGlyph size={19} brand />
            </div>
            {connection ? (
              <div className="connection-card">
                {connection.profilePictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Meta serves avatars from its own CDN.
                  <img
                    className="avatar avatar-connection is-photo"
                    src={connection.profilePictureUrl}
                    alt={connection.username ? `@${connection.username} profile picture` : "Instagram profile picture"}
                  />
                ) : (
                  <span className="avatar avatar-connection" aria-hidden><InstagramGlyph size={20} brand /></span>
                )}
                <div className="connection-card-id">
                  <strong>@{connection.username}</strong>
                  <span className="connection-status">
                    <span className={`signal-dot status-dot-${connection.status.toLowerCase()}`} />
                    {connection.status === "CONNECTED" ? "Connected" : connection.status === "EXPIRED" ? "Token expired" : "Disconnected"}
                    {" · "}
                    {formatDate(connection.connectedAt)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="muted connection-empty">
                No Instagram account connected yet. Link a professional account to start automating replies.
              </p>
            )}
            <Link className={`button ${connection ? "button-secondary" : "button-primary"} button-block`} href="/settings">
              <Link2 size={15} /> {connection ? "Manage connection" : "Connect Instagram"}
            </Link>
          </div>
        </section>

        <div className="profile-detail-grid">
            <section className="panel profile-card profile-security-card" aria-label="Security">
              <div className="panel-heading">
                <div><p className="eyebrow">Security</p><h2>Password &amp; sessions</h2></div>
                <ShieldCheck size={21} />
              </div>
              <p className="muted profile-section-lede">Use a unique password and control every active session from one place.</p>
              <form action="/api/account" method="post" className="account-form">
                <input type="hidden" name="action" value="change-password" />
                <div className="account-form-grid">
                  <label className="field">
                    <span>Current password</span>
                    <input name="currentPassword" type="password" autoComplete="current-password" required />
                  </label>
                  <label className="field">
                    <span>New password</span>
                    <input name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
                  </label>
                </div>
                <p className="muted account-form-hint">
                  At least 12 characters. Changing your password keeps your other devices signed in.
                </p>
                <button className="button button-secondary" type="submit">
                  <KeyRound size={15} /> Update password
                </button>
              </form>
              <div className="account-session-row">
                <div>
                  <strong>Sign out everywhere</strong>
                  <p className="muted">Invalidates every session across all your devices - including this one.</p>
                </div>
                <form action="/api/account" method="post">
                  <input type="hidden" name="action" value="logout-all" />
                  <button className="button button-secondary" type="submit">
                    <LogOut size={15} /> Sign out all
                  </button>
                </form>
              </div>
            </section>
          <aside className="profile-side">
            <section className="panel profile-card" aria-label="Related pages">
              <div className="panel-heading">
                <div><p className="eyebrow">Quick access</p><h2>Workspace links</h2></div>
                <Users size={19} strokeWidth={1.8} />
              </div>
              <nav className="related-links">
                <Link href="/settings">Team &amp; invitations <ArrowUpRight size={13} /></Link>
                <Link href="/help">Help centre <CircleHelp size={13} /></Link>
                <Link href="/privacy">Privacy policy <ExternalLink size={12} /></Link>
                <Link href="/data-deletion">Data deletion <ExternalLink size={12} /></Link>
              </nav>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
