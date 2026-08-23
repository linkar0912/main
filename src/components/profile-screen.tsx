"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  ExternalLink,
  KeyRound,
  Link2,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { InstagramGlyph } from "./instagram-glyph";
import type { ConnectionStatus, MemberRole } from "@/src/lib/repository";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { formatDate } from "@/src/lib/format-date";

type Connection = { id: string; igUserId: string; username: string; status: ConnectionStatus; connectedAt: string };

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

/** What the Instagram hero row says — read-only here; connect/disconnect lives on Settings. */
function connectionSummary(connections: Connection[]): { title: string; detail: string } {
  if (connections.length === 0) {
    return { title: "No Instagram account connected", detail: "Connect a professional account to start automating replies." };
  }
  if (connections.length === 1) {
    const [connection] = connections;
    return { title: `@${connection.username}`, detail: `Connected ${formatDate(connection.connectedAt)} — manage or disconnect in Settings.` };
  }
  return { title: `${connections.length} accounts connected`, detail: "Manage each connection, or add another, in Settings." };
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

  const { title: connectionTitle, detail: connectionDetail } = connectionSummary(connections);

  return (
    <AppShell>
      <div className="page-wrap narrow-wrap">
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

        <section className="profile-hero grid-texture" aria-label="Profile summary">
          <div className="profile-avatar-wrap">
            <span className="avatar avatar-large" aria-hidden>{initialsOf(email)}</span>
            <span className="profile-avatar-badge">Free</span>
          </div>
          <div className="profile-id">
            <strong>{displayNameFromEmail(email)}</strong>
            <small>{email}</small>
            <span className="profile-meta-line">
              {PRODUCT_NAME} workspace {roleLabel(role).toLowerCase()}
              {memberSince ? ` · joined ${formatDate(memberSince)}` : ""}
            </span>
          </div>
          <div className="profile-badges">
            <span className="profile-chip" data-tone="accent">{roleLabel(role)}</span>
            <span className="profile-chip">Free plan</span>
            <span className="profile-chip">{emailVerified ? "Email verified" : "Email unverified"}</span>
          </div>
        </section>

        <section className="settings-hero panel" aria-label="Connected Instagram">
          <div className="settings-icon"><InstagramGlyph size={25} brand /></div>
          <div className="settings-copy">
            <p className="eyebrow">Connection</p>
            <h2>{connectionTitle}</h2>
            <p>{connectionDetail}</p>
          </div>
          <div className="settings-action">
            <Link className={`button ${connections.length === 0 ? "button-primary" : "button-secondary"}`} href="/settings">
              <Link2 size={16} /> {connections.length === 0 ? "Connect Instagram" : "Manage in Settings"}
            </Link>
          </div>
        </section>

        <section className="panel" aria-label="Security">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Security</p>
              <h2>Password & devices</h2>
            </div>
            <ShieldCheck size={21} />
          </div>
          <form action="/api/account" method="post" className="account-form">
            <input type="hidden" name="action" value="change-password" />
            <label className="field">
              <span>Current password</span>
              <input name="currentPassword" type="password" autoComplete="current-password" required />
            </label>
            <label className="field">
              <span>New password</span>
              <input name="newPassword" type="password" autoComplete="new-password" minLength={12} required />
            </label>
            <p className="muted">At least 12 characters. Your other devices stay signed in.</p>
            <button className="button button-secondary" type="submit">
              <KeyRound size={15} /> Update password
            </button>
          </form>
          <form action="/api/account" method="post">
            <input type="hidden" name="action" value="logout-all" />
            <button className="button button-secondary" type="submit">
              <LogOut size={15} /> Sign out of all devices
            </button>
          </form>
        </section>

        <nav className="profile-footer-links" aria-label="Related pages">
          <Link href="/settings">Team & invitations</Link>
          <Link href="/help">Help centre</Link>
          <Link href="/privacy">Privacy policy <ExternalLink size={12} /></Link>
          <Link href="/data-deletion">Data deletion <ExternalLink size={12} /></Link>
        </nav>
      </div>
    </AppShell>
  );
}
