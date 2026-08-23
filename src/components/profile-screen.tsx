"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  ExternalLink,
  KeyRound,
  Link2,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { StatusBadge } from "./status-badge";
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

export function ProfileScreen({ email, memberSince, emailVerified, role }: ProfileScreenProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [disconnectingId, setDisconnectingId] = useState("");
  const [disconnectError, setDisconnectError] = useState("");
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

  async function disconnect(id: string) {
    if (disconnectingId) return;
    setDisconnectingId(id);
    setDisconnectError("");
    try {
      const response = await fetch("/api/meta/connection", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error("Could not disconnect Instagram");
      setConnections((current) => current.filter((connection) => connection.id !== id));
    } catch (error) {
      setDisconnectError(error instanceof Error ? error.message : "Could not disconnect Instagram");
    } finally {
      setDisconnectingId("");
    }
  }

  return (
    <AppShell>
      <div className="page-wrap narrow-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Account</p>
            <h1>My Profile</h1>
            <p className="muted page-lede">Your identity, security settings, and connected Instagram account in one place.</p>
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

        <div className="profile-grid">
          <section className="panel profile-panel" aria-label="Account details">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Account</p>
                <h2>Details</h2>
              </div>
              <UserRound size={21} />
            </div>
            <ul className="kv-list">
              <li>
                <span className="kv-label"><Mail size={12} /> Email</span>
                <span className="kv-value">{email || "—"}</span>
              </li>
              <li>
                <span className="kv-label">Role</span>
                <span className="kv-value">{roleLabel(role)}</span>
              </li>
              <li>
                <span className="kv-label">Plan</span>
                <span className="kv-value">Free</span>
              </li>
            </ul>
          </section>

          <section className="panel profile-panel" aria-label="Connected Instagram">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Connections</p>
                <h2>Instagram account</h2>
              </div>
              <InstagramGlyph size={21} />
            </div>
            {disconnectError && <p className="form-error" role="alert">{disconnectError}</p>}
            {connections.length === 0 ? (
              <>
                <p className="muted">No Instagram account is connected yet. Connect one to start automating replies.</p>
                <div className="profile-actions">
                  <Link className="button button-primary" href="/settings">
                    <Link2 size={16} /> Connect Instagram
                  </Link>
                </div>
              </>
            ) : (
              <>
                <ul className="kv-list">
                  {connections.map((connection) => (
                    <li key={connection.id}>
                      <span className="kv-label">@{connection.username}</span>
                      <span className="kv-value"><StatusBadge status={connection.status} /></span>
                    </li>
                  ))}
                </ul>
                <div className="profile-actions">
                  <Link className="button button-secondary" href="/settings">Manage connection</Link>
                  {connections.map((connection) => (
                    <button
                      className="button button-secondary"
                      key={connection.id}
                      type="button"
                      disabled={disconnectingId === connection.id}
                      onClick={() => void disconnect(connection.id)}
                    >
                      {disconnectingId === connection.id ? "Disconnecting…" : `Disconnect @${connection.username}`}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="panel profile-panel" aria-label="Security">
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

          <section className="panel profile-panel" aria-label="Related pages">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Workspace</p>
                <h2>Related pages</h2>
              </div>
              <ExternalLink size={21} />
            </div>
            <ul className="kv-list">
              <li>
                <span className="kv-label">Team & invitations</span>
                <Link className="text-link" href="/settings">Open settings</Link>
              </li>
              <li>
                <span className="kv-label">Help centre</span>
                <Link className="text-link" href="/help">Browse guides</Link>
              </li>
              <li>
                <span className="kv-label">Privacy policy</span>
                <Link className="text-link" href="/privacy">View <ExternalLink size={12} /></Link>
              </li>
              <li>
                <span className="kv-label">Data deletion</span>
                <Link className="text-link" href="/data-deletion">View <ExternalLink size={12} /></Link>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
