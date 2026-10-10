"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { ArrowLeft, Ban, Download, Info, PauseCircle, PlayCircle, RotateCcw } from "lucide-react";

import { PageHeader } from "@/src/components/page-header";
import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import type { AdminWorkspaceDetail } from "@/src/lib/admin/accounts-repository";
import { adminCommand, adminCommandResponse, adminErrorMessage, downloadAdminFile } from "./shared/admin-request";
import { REASON_LABEL } from "./shared/reason-dialog";
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

type Section = "entitlement" | "controls" | "exports";
type Notice = { section: Section; tone: "error" | "success"; text: string };

// Feedback renders inside the section whose form triggered it, so the result
// of a command at the bottom of the page is not shown off-screen at the top.
function SectionNotice({ notice, section }: { notice: Notice | null; section: Section }) {
  if (notice?.section !== section) return null;
  return notice.tone === "error"
    ? <div className="form-error admin-message" role="alert">{notice.text}</div>
    : <div className="form-success admin-message" role="status">{notice.text}</div>;
}

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

function roleLabel(role: string): string {
  const text = role.toLowerCase().replaceAll("_", " ");
  return `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;
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
  const [exportReason, setExportReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
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

  function fail(section: Section, text: string) {
    setNotice({ section, tone: "error", text });
  }

  async function mutate<T>(section: Section, run: () => Promise<T>, success: string | ((result: T) => string), refresh = true) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await run();
      setNotice({ section, tone: "success", text: typeof success === "string" ? success : success(result) });
      if (refresh) router.refresh();
    } catch (cause) {
      setNotice({ section, tone: "error", text: adminErrorMessage(cause) });
    } finally {
      setBusy(false);
      if (section === "controls") lifecycleButton.current?.focus();
    }
  }

  function lifecycle(event: FormEvent) {
    event.preventDefault();
    const action = suspended ? "RESTORE" : "SUSPEND";
    if (action === "SUSPEND" && confirmation !== phrase) {
      fail("controls", `Type ${phrase} exactly to continue.`);
      return;
    }
    void mutate(
      "controls",
      () => adminCommand(`/api/admin/workspaces/${workspace.id}/lifecycle`, { body: { action, version: workspace.version }, reason }),
      suspended ? "Workspace restored." : "Workspace suspended.",
    );
  }

  function pauseAutomations() {
    void mutate(
      "controls",
      () => adminCommand<{ paused: number }>(`/api/admin/workspaces/${workspace.id}/automations/pause`, { body: { version: workspace.version }, reason }),
      (data) => `${data?.paused ?? 0} live automations paused.`,
    );
  }

  function resumeAutomations() {
    void mutate(
      "controls",
      () => adminCommand<{ resumed: number; skipped: number }>(`/api/admin/workspaces/${workspace.id}/automations/resume`, { body: { version: workspace.version }, reason }),
      (data) => `${data?.resumed ?? 0} automations resumed.${data?.skipped ? ` ${data.skipped} changed since the pause and stay as they are.` : ""}`,
    );
  }

  function exportWorkspace(format: "csv" | "json") {
    void mutate(
      "exports",
      async () => {
        const response = await adminCommandResponse(`/api/admin/workspaces/${workspace.id}/export`, { body: { format }, reason: exportReason, fallback: "workspace_export_failed" });
        downloadAdminFile(await response.blob(), `linkar-workspace-${workspace.id}.${format}`);
      },
      `${format.toUpperCase()} export downloaded.`,
      false,
    );
  }

  function saveEntitlement(event: FormEvent) {
    event.preventDefault();
    if (!entitlement) {
      fail("entitlement", "This workspace has no plan record yet.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(overrides);
    } catch {
      fail("entitlement", "Custom limits must be valid JSON.");
      return;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      fail("entitlement", "Custom limits must be a JSON object. Use {} to keep every plan value.");
      return;
    }
    void mutate(
      "entitlement",
      () => adminCommand(`/api/admin/workspaces/${workspace.id}/entitlement`, { method: "PATCH", body: { planId, overrides: parsed, version: entitlement.version }, reason: entitlementReason }),
      "Plan and limits saved.",
    );
  }

  return (
    <main className="page-wrap admin-page">
      <PageHeader
        back={<Link className="admin-back" href="/admin/workspaces"><ArrowLeft size={16} aria-hidden /> All workspaces</Link>}
        title={workspace.name}
        description={<>{workspace.slug}, created <RelativeTime inline value={workspace.createdAt} /></>}
        actions={<StatusPill status={workspace.status} />}
      />

      <nav className="admin-tabs" aria-label="Workspace detail sections">
        <a href="#overview">Overview</a>
        {entitlement ? <a href="#entitlement">Plan and limits</a> : null}
        <a href="#members">Members</a>
        <a href="#connections">Connected accounts</a>
        <a href="#controls">Suspend or pause</a>
        <a href="#exports">Exports</a>
      </nav>

      <section id="overview" className="admin-card" aria-labelledby="workspace-overview-title">
        <div className="admin-card-head">
          <h2 id="workspace-overview-title">At a glance</h2>
          <IdChip id={workspace.id} prefix="Workspace ID" />
        </div>
        <dl className="admin-kv is-grid">
          <div><dt>Plan</dt><dd>{entitlement?.effectivePlan?.name ?? workspace.planName}</dd></div>
          <div><dt>Members</dt><dd>{workspace.memberCount}</dd></div>
          <div><dt>Automations</dt><dd>{workspace.automationCount}</dd></div>
          <div><dt>Instagram accounts</dt><dd>{workspace.instagramConnectionCount}</dd></div>
          <div><dt>Facebook Pages</dt><dd>{workspace.facebookConnectionCount}</dd></div>
          <div><dt>Last changed</dt><dd><RelativeTime value={workspace.updatedAt} /></dd></div>
        </dl>
      </section>

      {entitlement ? (
        <section id="entitlement" className="admin-card" aria-labelledby="entitlement-title">
          <div className="admin-card-head">
            <div>
              <h2 id="entitlement-title">Plan and limits</h2>
              <p>What this workspace can use, and how much it has used this period.</p>
            </div>
          </div>
          {entitlement.premiumExpiresAt ? (
            <p className="admin-callout"><Info size={16} aria-hidden /><span>Invite-code access is active until <RelativeTime inline value={entitlement.premiumExpiresAt} />. Plan and limit changes below take effect after that.</span></p>
          ) : null}
          <div className="admin-columns">
            <div>
              <h3 className="admin-subtitle">This period</h3>
              <dl className="admin-kv">
                <div><dt>Period started</dt><dd><RelativeTime value={entitlement.usage.periodStart} /></dd></div>
                <div><dt>Messages reserved</dt><dd>{entitlement.usage.deliveriesReserved.toLocaleString("en-IN")}</dd></div>
                <div><dt>Broadcasts created</dt><dd>{entitlement.usage.broadcastsCreated.toLocaleString("en-IN")}</dd></div>
              </dl>
            </div>
            <div>
              <h3 className="admin-subtitle">Limits in effect</h3>
              <dl className="admin-kv">
                {Object.entries(entitlement.effective).map(([keyName, value]) => (
                  <div key={keyName}><dt>{entitlementLabel(keyName)}</dt><dd>{entitlementValue(value)}</dd></div>
                ))}
              </dl>
            </div>
          </div>
          <form className="admin-form" onSubmit={saveEntitlement}>
            <label className="field">
              <span>Plan</span>
              <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
                {assignablePlans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name}{plan.isActive ? "" : " (retired)"}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Custom limits (JSON)</span>
              <textarea className="admin-code-input" value={overrides} onChange={(event) => setOverrides(event.target.value)} spellCheck={false} />
              <small>Only known limit and feature names are accepted. Use <code>null</code> for unlimited and leave a name out to use the plan&apos;s value.</small>
            </label>
            <label className="field">
              <span>{REASON_LABEL}</span>
              <input required minLength={3} maxLength={500} value={entitlementReason} onChange={(event) => setEntitlementReason(event.target.value)} />
            </label>
            <div className="admin-actions">
              <button className="button button-primary" disabled={busy} type="submit">Save plan and limits</button>
            </div>
            <SectionNotice notice={notice} section="entitlement" />
          </form>
        </section>
      ) : null}

      <section id="members" className="admin-card" aria-labelledby="members-title">
        <div className="admin-card-head"><h2 id="members-title">Members</h2></div>
        {members.length === 0 ? <p className="admin-hint">This workspace has no members.</p> : (
          <ul className="admin-list">
            {members.map((member) => (
              <li key={`${member.userId}-${member.email}`}>
                <span className="admin-list-main">
                  {member.userId ? <Link href={`/admin/users/${member.userId}`}>{member.email}</Link> : <strong>{member.email}</strong>}
                  <span className="cell-meta">{member.userId ? <IdChip id={member.userId} prefix="User ID" /> : <span>Invited, has not signed in yet</span>}</span>
                </span>
                <span className="admin-list-side">{roleLabel(member.role)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="connections" className="admin-card" aria-labelledby="connections-title">
        <div className="admin-card-head">
          <h2 id="connections-title">Connected accounts</h2>
          <Link className="button button-secondary button-small" href={`/admin/integrations?workspaceId=${encodeURIComponent(workspace.id)}`}>Check account health</Link>
        </div>
        {instagramConnections.length === 0 && facebookConnections.length === 0 ? <p className="admin-hint">No provider connections.</p> : (
          <ul className="admin-list">
            {instagramConnections.map((item) => (
              <li key={item.id}>
                <span className="admin-list-main"><strong>@{item.username}</strong><span className="cell-meta"><span>Instagram</span><span>Connected <RelativeTime inline value={item.connectedAt} /></span></span></span>
                <StatusPill status={item.status} />
              </li>
            ))}
            {facebookConnections.map((item) => (
              <li key={item.id}>
                <span className="admin-list-main"><strong>{item.pageName}</strong><span className="cell-meta"><span>Facebook Page</span><span>Connected <RelativeTime inline value={item.connectedAt} /></span></span></span>
                <StatusPill status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="controls" className="admin-card is-danger" aria-labelledby="controls-title">
        <div className="admin-card-head">
          <div>
            <h2 id="controls-title">Suspend or pause</h2>
            <p>Suspending locks everyone out of this workspace. Pausing stops its automations but keeps access.</p>
          </div>
        </div>
        {deletionLocked ? <p className="admin-callout is-danger"><Info size={16} aria-hidden /><span>This workspace is queued for permanent deletion, so it cannot be suspended or restored.</span></p> : null}
        {suspended && workspace.suspendedReason ? <p className="admin-hint">Suspended because: {workspace.suspendedReason}</p> : null}
        <form className="admin-form" onSubmit={lifecycle}>
          <label className="field">
            <span>{REASON_LABEL}</span>
            <textarea required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          {!suspended && !deletionLocked ? (
            <label className="field">
              <span>Type <code className="admin-phrase">{phrase}</code> to confirm a suspension</span>
              <input required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} />
            </label>
          ) : null}
          <div className="admin-actions">
            <button ref={lifecycleButton} className={`button ${suspended ? "button-primary" : "button-danger"}`} disabled={busy || deletionLocked} type="submit">
              {suspended ? <><RotateCcw size={16} aria-hidden /> Restore workspace</> : <><Ban size={16} aria-hidden /> Suspend workspace</>}
            </button>
            <button className="button button-secondary" disabled={busy || reason.trim().length < 3} type="button" onClick={pauseAutomations}>
              <PauseCircle size={16} aria-hidden /> Pause live automations
            </button>
            <button className="button button-ghost" disabled={busy || deletionLocked || suspended || reason.trim().length < 3} type="button" onClick={resumeAutomations}>
              <PlayCircle size={16} aria-hidden /> Resume paused automations
            </button>
          </div>
          <p className="admin-hint">Resume turns back on the automations the last pause stopped, except any changed since.</p>
          <SectionNotice notice={notice} section="controls" />
        </form>
      </section>

      <section id="exports" className="admin-card" aria-labelledby="exports-title">
        <div className="admin-card-head">
          <div>
            <h2 id="exports-title">Export data</h2>
            <p>Workspace details, members, contacts and automations. Passwords, access tokens and raw Meta data are never included. Workspaces over 50,000 rows must be exported offline.</p>
          </div>
        </div>
        <div className="admin-form">
          <label className="field">
            <span>{REASON_LABEL}</span>
            <input required minLength={3} maxLength={500} value={exportReason} onChange={(event) => setExportReason(event.target.value)} />
          </label>
          <div className="admin-actions">
            <button className="button button-secondary" disabled={busy || exportReason.trim().length < 3} type="button" onClick={() => exportWorkspace("csv")}><Download size={16} aria-hidden /> Download CSV</button>
            <button className="button button-ghost" disabled={busy || exportReason.trim().length < 3} type="button" onClick={() => exportWorkspace("json")}>Download JSON</button>
          </div>
          <SectionNotice notice={notice} section="exports" />
        </div>
      </section>
    </main>
  );
}
