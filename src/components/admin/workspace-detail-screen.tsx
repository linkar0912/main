"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { ArrowLeft, Ban, Download, PauseCircle, RadioTower, RotateCcw, Users } from "lucide-react";

import type { AdminWorkspaceDetail } from "@/src/lib/admin/accounts-repository";

function key(): string {
  return `admin-${Date.now()}-${crypto.randomUUID()}`;
}

async function command(url: string, body: unknown, reason: string, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json", "x-admin-reason": reason, "idempotency-key": key() },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "admin_operation_failed");
  return payload;
}

export function WorkspaceDetailScreen({ workspace }: { workspace: AdminWorkspaceDetail }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lifecycleButton = useRef<HTMLButtonElement>(null);
  const phrase = `SUSPEND ${workspace.slug}`;

  async function mutate(run: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Operation failed");
    } finally {
      setBusy(false);
      lifecycleButton.current?.focus();
    }
  }

  function lifecycle(event: FormEvent) {
    event.preventDefault();
    const action = workspace.status === "SUSPENDED" ? "RESTORE" : "SUSPEND";
    if (action === "SUSPEND" && confirmation !== phrase) {
      setError(`Type ${phrase} exactly to continue.`);
      return;
    }
    void mutate(() => command(`/api/admin/workspaces/${workspace.id}/lifecycle`, { action, version: workspace.version }, reason));
  }

  return (
    <main className="page-wrap admin-resource-page">
      <Link className="admin-back-inline" href="/admin/workspaces"><ArrowLeft size={16} /> All workspaces</Link>
      <header className="page-header admin-detail-header">
        <div><p className="eyebrow">Workspace / {workspace.id}</p><h1>{workspace.name}</h1><p className="muted page-lede">{workspace.slug} · created {new Date(workspace.createdAt).toLocaleDateString()}</p></div>
        <span className={`status-pill is-${workspace.status.toLowerCase()}`}>{workspace.status.toLowerCase()}</span>
      </header>

      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <nav className="admin-section-tabs" aria-label="Workspace detail sections">
        <a href="#overview">Overview</a><a href="#members">Members</a><a href="#connections">Connections</a><a href="#controls">Controls</a><a href="#exports">Exports</a>
      </nav>

      <section id="overview" className="admin-detail-grid">
        <article className="panel admin-summary-card"><p className="eyebrow">Effective plan</p><h2>{workspace.planName}</h2><p className="muted">Key: {workspace.planKey}</p><dl><div><dt>Members</dt><dd>{workspace.memberCount}</dd></div><div><dt>Automations</dt><dd>{workspace.automationCount}</dd></div><div><dt>Entitlement version</dt><dd>{workspace.entitlementVersion ?? 1}</dd></div></dl></article>
        <article className="panel admin-summary-card"><p className="eyebrow">Channels</p><h2>Integration footprint</h2><dl><div><dt>Instagram</dt><dd>{workspace.instagramConnectionCount}</dd></div><div><dt>Facebook</dt><dd>{workspace.facebookConnectionCount}</dd></div><div><dt>Record version</dt><dd>{workspace.version}</dd></div></dl></article>
      </section>

      <section id="members" className="panel admin-detail-section">
        <div className="panel-heading"><div><p className="eyebrow">Access</p><h2>Workspace members</h2></div><Users size={20} /></div>
        <div className="admin-record-list">{workspace.members?.map((member) => <div className="admin-record-row" key={`${member.userId}-${member.email}`}><span><strong>{member.email}</strong><small>{member.userId ?? "Awaiting identity link"}</small></span><span className="status-pill">{member.role.toLowerCase()}</span></div>) ?? <p className="muted">No members returned.</p>}</div>
      </section>

      <section id="connections" className="panel admin-detail-section">
        <div className="panel-heading"><div><p className="eyebrow">Provider state</p><h2>Connections</h2></div><RadioTower size={20} /></div>
        <div className="admin-record-list">
          {workspace.instagramConnections?.map((item) => <div className="admin-record-row" key={item.id}><span><strong>@{item.username}</strong><small>Instagram · {item.igUserId}</small></span><span className="status-pill">{item.status}</span></div>)}
          {workspace.facebookConnections?.map((item) => <div className="admin-record-row" key={item.id}><span><strong>{item.pageName}</strong><small>Facebook · {item.pageId}</small></span><span className="status-pill">{item.status}</span></div>)}
          {!workspace.instagramConnections?.length && !workspace.facebookConnections?.length ? <p className="muted">No provider connections.</p> : null}
        </div>
      </section>

      <section id="controls" className="panel admin-detail-section admin-danger-panel">
        <div className="panel-heading"><div><p className="eyebrow">Audited controls</p><h2>Workspace lifecycle</h2></div><Ban size={20} /></div>
        <form className="admin-command-form" onSubmit={lifecycle}>
          <label className="field"><span>Operator reason</span><textarea required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          {workspace.status !== "SUSPENDED" ? <label className="field"><span>Type <code>{phrase}</code></span><input required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label> : null}
          <div className="admin-command-actions">
            <button ref={lifecycleButton} className={`button ${workspace.status === "SUSPENDED" ? "button-primary" : "button-danger"}`} disabled={busy} type="submit">{workspace.status === "SUSPENDED" ? <><RotateCcw size={16} /> Restore workspace</> : <><Ban size={16} /> Suspend workspace</>}</button>
            <button className="button button-secondary" disabled={busy || reason.length < 3} type="button" onClick={() => void mutate(() => command(`/api/admin/workspaces/${workspace.id}/automations/pause`, { version: workspace.version }, reason))}><PauseCircle size={16} /> Pause active automations</button>
          </div>
        </form>
      </section>

      <section id="exports" className="panel admin-detail-section">
        <div className="panel-heading"><div><p className="eyebrow">Safe dataset</p><h2>Workspace export</h2></div><Download size={20} /></div>
        <p className="muted">Exports contain workspace metadata, members, contacts, and automations. Credentials and provider payloads are excluded.</p>
        <div className="admin-command-actions"><a className="button button-secondary" href={`/api/admin/workspaces/${workspace.id}/export?format=csv`}>Download CSV</a><a className="button button-ghost" href={`/api/admin/workspaces/${workspace.id}/export?format=json`}>Download JSON</a></div>
      </section>
    </main>
  );
}
