"use client";

import Link from "next/link";
import { Camera, Check, ExternalLink, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "./app-shell";
import { StatusBadge } from "./status-badge";
import type { ConnectionStatus } from "@/src/lib/repository";
import { PRODUCT_NAME } from "@/src/lib/branding";

type Connection = { id: string; igUserId: string; username: string; status: ConnectionStatus; connectedAt: string };

export function SettingsScreen() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [mode, setMode] = useState<"demo" | "configured">("demo");
  const [metaState] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("meta") ?? "");
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState("");

  async function disconnect() {
    if (!connection || disconnecting) return;
    setDisconnecting(true);
    setDisconnectError("");
    try {
      const response = await fetch("/api/meta/connection", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: connection.id }),
      });
      if (!response.ok) throw new Error("Could not disconnect Instagram");
      setConnection(null);
    } catch (error) {
      setDisconnectError(error instanceof Error ? error.message : "Could not disconnect Instagram");
    } finally {
      setDisconnecting(false);
    }
  }

  useEffect(() => {
    void Promise.all([fetch("/api/meta/connection"), fetch("/api/health")]).then(async ([connectionResponse, healthResponse]) => {
      const connectionPayload = (await connectionResponse.json()) as { data?: Connection[] };
      const healthPayload = (await healthResponse.json()) as { mode?: "demo" | "configured" };
      setConnection(connectionPayload.data?.[0] ?? null);
      setMode(healthPayload.mode ?? "demo");
    }).catch(() => undefined);
  }, []);

  const statusMessage: Record<string, string> = {
    connected: "Instagram is connected. The account is ready for review testing.",
    "missing-config": "Add your Meta App ID and redirect URI before connecting Instagram.",
    "missing-encryption-key": "Add META_TOKEN_ENCRYPTION_KEY before connecting an account.",
    "invalid-state": "The Meta sign-in expired. Start the connection again.",
    error: "Meta could not finish the connection. Check the app settings and try again.",
  };

  return (
    <AppShell>
      <div className="page-wrap narrow-wrap">
        <header className="page-header"><div><p className="eyebrow">Workspace / settings</p><h1>Connect your Instagram.</h1><p className="muted page-lede">{PRODUCT_NAME} uses Meta’s official Instagram APIs. You stay in control of the account and the rules.</p></div></header>

        {metaState && <div className={`notice-banner ${metaState === "connected" ? "notice-success" : "notice-warning"}`} role="status"><span>{metaState === "connected" ? <Check size={17} /> : <LockKeyhole size={17} />}</span><p>{statusMessage[metaState] ?? "Connection status updated."}</p></div>}

        <section className="settings-hero panel">
          <div className="settings-icon"><Camera size={25} /></div>
          <div className="settings-copy"><p className="eyebrow">Instagram connection</p><h2>{connection ? `@${connection.username}` : "No account connected"}</h2><p>{connection ? "This account can receive comment and DM webhooks." : "Connect a professional Instagram account to enable delivery."}</p></div>
          <div className="settings-action">{connection ? <><StatusBadge status={connection.status} /> <button className="button button-secondary" type="button" disabled={disconnecting} onClick={() => void disconnect()}>{disconnecting ? "Disconnecting…" : "Disconnect"}</button></> : <a className="button button-primary" href="/api/meta/oauth/start">Connect Instagram <ExternalLink size={15} /></a>}</div>
        </section>
        {disconnectError && <p className="form-error" role="alert">{disconnectError}</p>}

        <div className="settings-grid">
          <section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">Data handling</p><h2>Built for review</h2></div><ShieldCheck size={21} /></div><ul className="check-list"><li><Check size={16} /> Access tokens are encrypted at rest.</li><li><Check size={16} /> Webhook signatures are verified before processing.</li><li><Check size={16} /> Duplicate events are ignored safely.</li><li><Check size={16} /> No AI or scraping is used in this MVP.</li></ul></section>
          <section className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">App mode</p><h2>{mode === "demo" ? "Demo mode" : "Connected mode"}</h2></div><span className={`mode-orb ${mode === "demo" ? "orb-demo" : "orb-live"}`} /></div><p className="muted">{mode === "demo" ? "The workspace runs on sample data until DATABASE_URL and Meta credentials are configured." : "This workspace is configured for Meta-backed delivery."}</p><Link className="text-link" href="/support">Read setup support <ExternalLink size={15} /></Link></section>
        </div>

        <section className="review-links panel"><div><p className="eyebrow">Submission surfaces</p><h2>Public pages your reviewers can open</h2></div><div className="review-link-grid"><Link href="/privacy">Privacy policy <ExternalLink size={14} /></Link><Link href="/terms">Terms of service <ExternalLink size={14} /></Link><Link href="/data-deletion">Data deletion <ExternalLink size={14} /></Link><Link href="/support">Support <ExternalLink size={14} /></Link></div></section>
      </div>
    </AppShell>
  );
}
