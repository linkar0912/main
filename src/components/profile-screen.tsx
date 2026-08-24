"use client";

import Link from "next/link";
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

export function ProfileScreen({ email, memberSince, emailVerified, role }: ProfileScreenProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [saved, setSaved] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("accountSaved") === "password";
  });
  const [accountError] = useState(() => {
    if (typeof window === "undefined") return "";
    const error = new URLSearchParams(window.location.search).get("accountError");
    if (error === "current") return "That current password is incorrect.";
    if (error === "password") return "The new password must be at least 12 characters.";
    if (error === "unknown") return "That action is not available.";
    return "";
  });

  // Auto-dismiss the success banner after a short pause.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 4000);
    return () => clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    fetch("/api/meta/connection")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data?: Connection[] } | null) => setConnections(payload?.data ?? []))
      .catch(() => undefined);
  }, []);

  const connection = connections[0];
  const avatar = connection?.profilePictureUrl ?? undefined;

  return (
    <AppShell>
      <div className="page-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>My Profile</h1>
            <p className="muted page-lede">Your identity, security, and connected Instagram account in one place.</p>
          </div>
        </header>

        {saved && (
          <div className="notice-banner notice-success" role="status">
            <BadgeCheck size={17} />
            <p>Password updated. Use it next time you sign in.</p>
          </div>
        )}
        {accountError && (
          <div className="notice-banner notice-warning" role="alert">
            <p>{accountError}</p>
          </div>
        )}

        <div className="profile-layout">
          <div className="profile-main">
            <section className="panel" aria-label="Account summary">
              <div className="account-summary">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Meta CDN avatar; next/image adds no value for one remote photo.
                  <img className="avatar avatar-summary is-photo" src={avatar} alt="" />
                ) : (
                  <span className="avatar avatar-summary" aria-hidden>{initialsOf(email)}</span>
                )}
                <div className="account-summary-id">
                  <strong>{displayNameFromEmail(email)}</strong>
                  <small>{email}</small>
                  <span className="account-summary-meta">
                    {memberSince ? `Joined ${formatDate(memberSince)}` : "Workspace member"}
                  </span>
                </div>
                <div className="account-summary-chips">
                  <span className="profile-chip" data-tone="accent">{roleLabel(role)}</span>
                  <span className="profile-chip">Free plan</span>
                  <span className="profile-chip" data-tone={emailVerified ? "ok" : "warn"}>
                    {emailVerified ? "Email verified" : "Email unverified"}
                  </span>
                </div>
              </div>
            </section>

            <section className="panel" aria-label="Security">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Security</p>
                  <h2>Password &amp; devices</h2>
                </div>
                <ShieldCheck size={21} />
              </div>
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
          </div>

          <aside className="profile-side">
            <section className="side-panel" aria-label="Connected Instagram">
              <div className="panel-heading">
                <div><p className="eyebrow">Connection</p><h2>Instagram</h2></div>
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
                <Link2 size={15} /> {connection ? "Manage in Settings" : "Connect Instagram"}
              </Link>
            </section>

            <section className="side-panel" aria-label="Related pages">
              <div className="panel-heading">
                <div><p className="eyebrow">Workspace</p><h2>Related</h2></div>
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
