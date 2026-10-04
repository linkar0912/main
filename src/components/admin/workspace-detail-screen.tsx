"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { ArrowLeft, Ban, Download, PauseCircle, RadioTower, RotateCcw, Users } from "lucide-react";

import { formatAdminDate, formatAdminDateTime } from "@/src/components/admin/shared/date-format";
import type { AdminWorkspaceDetail } from "@/src/lib/admin/accounts-repository";
import { adminCommand, adminErrorMessage } from "./shared/admin-request";
import { StatusPill } from "./shared/status-pill";

type WorkspaceEntitlement = {
  plan: { id: string; key: string; name: string };
  effectivePlan?: { id: string; key: string; name: string };
  premiumExpiresAt?: string | null;
  defaults: Record<string, number | boolean | null>;
  overrides: Record<string, number | boolean | null | undefined>;
  effective: Record<string, number | boolean | null>;
  version: number;
  usage: { deliveriesReserved: number; broadcastsCreated: number; periodStart: string };
};

function entitlementLabel(key: string): string {
  // memberLimit -> "Member limit", exportsEnabled -> "Exports enabled"
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return `${words[0].toUpperCase()}${words.slice(1)}`;
}

function entitlementValue(value: number | boolean | null): string {
  if (value === null) return "Unlimited";
  if (typeof value === "boolean") return value ? "Enabled" : "Disabled";
  return value.toLocaleString("en-IN");
}

export function WorkspaceDetailScreen({
  workspace,
  entitlement,
  plans = [],
}: {
  workspace: AdminWorkspaceDetail;
  entitlement?: WorkspaceEntitlement;
  plans?: Array<{ id: string; key: string; name: string; isActive: boolean }>;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [entitlementReason, setEntitlementReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [planId, setPlanId] = useState(entitlement?.plan.id ?? "");
  const [overrides, setOverrides] = useState(JSON.stringify(entitlement?.overrides ?? {}, null, 2));
  const lifecycleButton = useRef<HTMLButtonElement>(null);

  const phrase = `SUSPEND ${workspace.slug}`;
  const suspended = workspace.status === "SUSPENDED";
  // A workspace queued for deletion is locked; lifecycle changes would overwrite that lock.
  const deletionLocked = Boolean(workspace.deletionScheduledAt) || workspace.status === "DELETION_PENDING";
  const members = workspace.members ?? [];
  const instagramConnections = workspace.instagramConnections ?? [];
  const facebookConnections = workspace.facebookConnections ?? [];
  const assignablePlans = plans.filter((plan) => plan.isActive || plan.id === entitlement?.plan.id);

  function fail(message: string) {
    setNotice(null);
    setError(message);
  }

  async function mutate(run: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await run();
      setNotice(success);
      router.refresh();
    } catch (cause) {
      setError(adminErrorMessage(cause));
    } finally {
      setBusy(false);
      lifecycleButton.current?.focus();
    }
  }

  function lifecycle(event: FormEvent) {
    event.preventDefault();
    const action = suspended ? "RESTORE" : "SUSPEND";
    if (action === "SUSPEND" && confirmation !== phrase) {
      fail(`Type ${phrase} exactly to continue.`);
      return;
    }
    void mutate(
      () => adminCommand(`/api/admin/workspaces/${workspace.id}/lifecycle`, { body: { action, version: workspace.version }, reason }),
      suspended ? "Workspace restored." : "Workspace suspended.",
    );
  }

  function pauseAutomations() {
    void mutate(
      () => adminCommand(`/api/admin/workspaces/${workspace.id}/automations/pause`, { body: { version: workspace.version }, reason }),
      "Active automations paused.",
    );
  }

  function saveEntitlement(event: FormEvent) {
    event.preventDefault();
    if (!entitlement) {
      fail("Entitlement record is unavailable.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(overrides);
    } catch {
      fail("Overrides must be valid JSON.");
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      fail("Overrides must be a JSON object, for example {} to inherit every plan value.");
      return;
    }
    void mutate(
      () => adminCommand(`/api/admin/workspaces/${workspace.id}/entitlement`, { method: "PATCH", body: { planId, overrides: parsed, version: entitlement.version }, reason: entitlementReason }),
      "Entitlement saved.",
    );
  }

  return (
    <main className="page-wrap admin-resource-page">
      <Link className="admin-back-inline" href="/admin/workspaces"><ArrowLeft size={16} /> All workspaces</Link>
      <header className="page-header admin-detail-header">
        <div>
          <p className="eyebrow">Workspace / {workspace.id}</p>
          <h1>{workspace.name}</h1>
          <p className="muted page-lede">{workspace.slug} · created {formatAdminDate(workspace.createdAt)}</p>
        </div>
        <StatusPill status={workspace.status} />
      </header>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {notice ? <div className="form-success" role="status">{notice}</div> : null}

      <nav className="admin-section-tabs" aria-label="Workspace detail sections">
        <a href="#overview">Overview</a>
        {entitlement ? <a href="#entitlement">Entitlement</a> : null}
        <a href="#members">Members</a>
        <a href="#connections">Connections</a>
        <a href="#controls">Controls</a>
        <a href="#exports">Exports</a>
      </nav>

      <section id="overview" className="admin-detail-grid">
        <article className="panel admin-summary-card">
          <p className="eyebrow">Effective plan</p>
          <h2>{entitlement?.effectivePlan?.name ?? workspace.planName}</h2>
          <p className="muted">Key: {entitlement?.effectivePlan?.key ?? workspace.planKey}</p>
          <dl>
            <div><dt>Members</dt><dd>{workspace.memberCount}</dd></div>
            <div><dt>Automations</dt><dd>{workspace.automationCount}</dd></div>
            <div><dt>Entitlement version</dt><dd>{workspace.entitlementVersion ?? 1}</dd></div>
          </dl>
        </article>
        <article className="panel admin-summary-card">
          <p className="eyebrow">Channels</p>
          <h2>Integration footprint</h2>
          <dl>
            <div><dt>Instagram</dt><dd>{workspace.instagramConnectionCount}</dd></div>
            <div><dt>Facebook</dt><dd>{workspace.facebookConnectionCount}</dd></div>
            <div><dt>Record version</dt><dd>{workspace.version}</dd></div>
          </dl>
        </article>
      </section>

      {entitlement ? (
        <section id="entitlement" className="panel admin-detail-section">
          <div className="panel-heading">
            <div><p className="eyebrow">Versioned entitlements</p><h2>Plan, usage, and overrides</h2></div>
            <StatusPill status="idle" label={`v${entitlement.version}`} />
          </div>
          {entitlement.premiumExpiresAt ? (
            <p className="muted">Premium invite access is active until {formatAdminDateTime(entitlement.premiumExpiresAt)}. Plan and override edits below apply after this access expires.</p>
          ) : null}
          <div className="admin-entitlement-grid">
            <div>
              <h3>Current period usage</h3>
              <dl className="admin-inline-kv">
                <div><dt>Period started</dt><dd>{formatAdminDate(entitlement.usage.periodStart)}</dd></div>
                <div><dt>Deliveries reserved</dt><dd>{entitlement.usage.deliveriesReserved.toLocaleString("en-IN")}</dd></div>
                <div><dt>Broadcasts created</dt><dd>{entitlement.usage.broadcastsCreated.toLocaleString("en-IN")}</dd></div>
              </dl>
            </div>
            <div>
              <h3>Effective limits</h3>
              <dl className="admin-inline-kv">
                {Object.entries(entitlement.effective).map(([keyName, value]) => (
                  <div key={keyName}><dt>{entitlementLabel(keyName)}</dt><dd>{entitlementValue(value)}</dd></div>
                ))}
              </dl>
            </div>
          </div>
          <form className="admin-command-form" onSubmit={saveEntitlement}>
            <label className="field">
              <span>Plan template</span>
              <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
                {assignablePlans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name} ({plan.key}){plan.isActive ? "" : " · retired"}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Strict override JSON</span>
              <textarea value={overrides} onChange={(event) => setOverrides(event.target.value)} spellCheck={false} />
            </label>
            <p className="admin-field-hint">Only documented limit and feature keys are accepted. Use <code>null</code> for unlimited; omit a key to inherit the plan.</p>
            <label className="field">
              <span>Reason for entitlement change</span>
              <input required minLength={3} maxLength={500} value={entitlementReason} onChange={(event) => setEntitlementReason(event.target.value)} />
            </label>
            <div className="admin-command-actions">
              <button className="button button-primary" disabled={busy} type="submit">Save entitlement</button>
            </div>
          </form>
        </section>
      ) : null}

      <section id="members" className="panel admin-detail-section">
        <div className="panel-heading">
          <div><p className="eyebrow">Access</p><h2>Workspace members</h2></div>
          <Users size={20} aria-hidden />
        </div>
        {members.length === 0 ? <p className="muted">This workspace has no members.</p> : (
          <div className="admin-record-list">
            {members.map((member) => (
              <div className="admin-record-row" key={`${member.userId}-${member.email}`}>
                <span>
                  {member.userId ? <Link href={`/admin/users/${member.userId}`}><strong>{member.email}</strong></Link> : <strong>{member.email}</strong>}
                  <small>{member.userId ?? "Awaiting identity link"}</small>
                </span>
                <StatusPill status="idle" label={member.role.toLowerCase()} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="connections" className="panel admin-detail-section">
        <div className="panel-heading">
          <div><p className="eyebrow">Provider state</p><h2>Connections</h2></div>
          <RadioTower size={20} aria-hidden />
        </div>
        {instagramConnections.length === 0 && facebookConnections.length === 0 ? <p className="muted">No provider connections.</p> : (
          <div className="admin-record-list">
            {instagramConnections.map((item) => (
              <div className="admin-record-row" key={item.id}>
                <span><strong>@{item.username}</strong><small>Instagram · {item.igUserId}</small></span>
                <StatusPill status={item.status} />
              </div>
            ))}
            {facebookConnections.map((item) => (
              <div className="admin-record-row" key={item.id}>
                <span><strong>{item.pageName}</strong><small>Facebook · {item.pageId}</small></span>
                <StatusPill status={item.status} />
              </div>
            ))}
          </div>
        )}
        <div className="admin-command-actions">
          <Link className="button button-secondary button-small" href={`/admin/integrations?workspaceId=${encodeURIComponent(workspace.id)}`}>Open integration health</Link>
        </div>
      </section>

      <section id="controls" className="panel admin-detail-section admin-danger-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Audited controls</p><h2>Workspace lifecycle</h2></div>
          <Ban size={20} aria-hidden />
        </div>
        {deletionLocked ? <p className="admin-warning-copy">This workspace is queued for permanent deletion, so it cannot be suspended or restored.</p> : null}
        {suspended && workspace.suspendedReason ? <p className="muted">Suspended: {workspace.suspendedReason}</p> : null}
        <form className="admin-command-form" onSubmit={lifecycle}>
          <label className="field">
            <span>Operator reason</span>
            <textarea required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          {!suspended && !deletionLocked ? (
            <label className="field">
              <span>Type <code>{phrase}</code></span>
              <input required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} />
            </label>
          ) : null}
          <div className="admin-command-actions">
            <button ref={lifecycleButton} className={`button ${suspended ? "button-primary" : "button-danger"}`} disabled={busy || deletionLocked} type="submit">
              {suspended ? <><RotateCcw size={16} /> Restore workspace</> : <><Ban size={16} /> Suspend workspace</>}
            </button>
            <button className="button button-secondary" disabled={busy || reason.trim().length < 3} type="button" onClick={pauseAutomations}>
              <PauseCircle size={16} /> Pause active automations
            </button>
          </div>
        </form>
      </section>

      <section id="exports" className="panel admin-detail-section">
        <div className="panel-heading">
          <div><p className="eyebrow">Safe dataset</p><h2>Workspace export</h2></div>
          <Download size={20} aria-hidden />
        </div>
        <p className="muted">Exports contain workspace metadata, members, contacts, and automations. Credentials and provider payloads are excluded.</p>
        <div className="admin-command-actions">
          <a className="button button-secondary" href={`/api/admin/workspaces/${workspace.id}/export?format=csv`}>Download CSV</a>
          <a className="button button-ghost" href={`/api/admin/workspaces/${workspace.id}/export?format=json`}>Download JSON</a>
        </div>
      </section>
    </main>
  );
}
