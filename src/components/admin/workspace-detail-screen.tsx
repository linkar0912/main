"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Ban, ChevronDown, Download, Info, PauseCircle, PlayCircle, RotateCcw, SlidersHorizontal } from "lucide-react";

import { PageHeader } from "@/src/components/page-header";
import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import { StatusBadge } from "@/src/components/ui/status-badge";
import type { AdminWorkspaceDetail } from "@/src/lib/admin/accounts-repository";
import { adminCommand, adminCommandResponse, adminErrorMessage, downloadAdminFile, humanizeAdminCode } from "./shared/admin-request";
import { describeAuditAction } from "./shared/audit-actions";
import { ReasonDialog } from "./shared/reason-dialog";
import { StatusPill } from "./shared/status-pill";
import {
  FEATURES,
  featureKeys,
  formatCount,
  LIMITS,
  limitKeys,
  limitsFormFrom,
  limitValueLabel,
  overridesFrom,
  usageRow,
  type EntitlementValue,
  type FeatureField,
  type LimitKey,
  type LimitsForm,
  type UsageRow,
} from "./workspace-limits";

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

/** This workspace's admin audit events, newest first. */
export type WorkspaceActivityEvent = {
  id: string;
  phase: string;
  actorEmail: string;
  action: string;
  reason: string;
  errorCode: string | null;
  createdAt: Date | string;
};

export const WORKSPACE_TABS = ["overview", "usage", "members", "accounts", "activity"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];
const TAB_LABELS: Record<WorkspaceTab, string> = {
  overview: "Overview",
  usage: "Usage & limits",
  members: "Members",
  accounts: "Connected accounts",
  activity: "Activity",
};

type Action = "plan" | "pause" | "resume" | "suspend" | "restore" | "export";
type Notice = { tone: "error" | "success"; text: string };

function roleLabel(role: string): string {
  const text = role.toLowerCase().replaceAll("_", " ");
  return `${text[0]?.toUpperCase() ?? ""}${text.slice(1)}`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

function isProblemStatus(status: string): boolean {
  return status !== "CONNECTED";
}

function UsageBar({ row }: { row: UsageRow }) {
  if (row.percent === null) return null;
  return (
    <div
      className={`usage-bar is-${row.tone}`}
      role="meter"
      aria-label={`${row.label} used`}
      aria-valuemin={0}
      aria-valuemax={row.limit ?? 0}
      aria-valuenow={row.used ?? 0}
      aria-valuetext={row.summary}
    >
      <span style={{ width: `${Math.min(100, Math.max(row.percent, row.percent > 0 ? 2 : 0))}%` }} />
    </div>
  );
}

function UsageLine({ row }: { row: UsageRow }) {
  const custom = row.custom !== undefined;
  return (
    <li className="usage-row" data-limit={row.key}>
      <div className="usage-row-head">
        <strong>{row.label}</strong>
        <span className={`usage-row-summary is-${row.tone}`}>{row.summary}</span>
      </div>
      <UsageBar row={row} />
      <p className="usage-row-source">
        {custom
          ? <>{row.planDefault !== undefined ? <>Plan default {limitValueLabel(row.planDefault)} · </> : null}<span className="usage-custom">Custom {limitValueLabel(row.custom)}</span></>
          : <>Plan default{row.planDefault !== undefined ? ` ${limitValueLabel(row.planDefault)}` : ""}</>}
      </p>
    </li>
  );
}

/** Real tabs: arrow keys move between them, the URL keeps ?tab= so a tab can be linked. */
function useTabs(initial: WorkspaceTab, tabs: readonly WorkspaceTab[]) {
  const [tab, setTab] = useState<WorkspaceTab>(tabs.includes(initial) ? initial : "overview");
  const refs = useRef<Partial<Record<WorkspaceTab, HTMLButtonElement | null>>>({});

  function select(next: WorkspaceTab, focus = false) {
    setTab(next);
    if (focus) refs.current[next]?.focus();
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = tabs.indexOf(tab);
    const next = event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length]
      : event.key === "ArrowLeft" ? tabs[(index - 1 + tabs.length) % tabs.length]
        : event.key === "Home" ? tabs[0]
          : event.key === "End" ? tabs[tabs.length - 1] : null;
    if (!next) return;
    event.preventDefault();
    select(next, true);
  }

  return { tab, select, onKeyDown, refs };
}

function ActionsMenu({ items, onPick }: { items: Array<{ action: Action; label: string; icon: React.ReactNode; danger?: boolean; disabled?: string }>; onPick: (action: Action) => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not([disabled])")?.focus();
    const close = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const entries = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not([disabled])") ?? []);
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      entries[(index + step + entries.length) % entries.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? entries[0] : entries.at(-1))?.focus();
    }
  }

  return (
    <div className="admin-menu">
      <button ref={button} type="button" className="button button-secondary" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}>
        Actions <ChevronDown size={16} aria-hidden />
      </button>
      {open ? (
        <div ref={menu} id={menuId} className="admin-menu-list" role="menu" aria-label="Workspace actions" onKeyDown={onMenuKey}>
          {items.map((item) => (
            <button key={item.action} type="button" role="menuitem" className={item.danger ? "is-danger" : undefined} disabled={Boolean(item.disabled)} title={item.disabled}
              onClick={() => { setOpen(false); onPick(item.action); }}>
              {item.icon}
              <span>
                {item.label}
                {item.disabled ? <small>{item.disabled}</small> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LimitsFields({ form, setForm, defaults, samePlan, invalid }: { form: LimitsForm; setForm: (next: LimitsForm) => void; defaults: Record<string, EntitlementValue>; samePlan: boolean; invalid: { key: LimitKey; message: string } | null }) {
  const planValue = (key: string) => samePlan && key in defaults ? limitValueLabel(defaults[key]) : null;
  return (
    <>
      <fieldset className="admin-limits-fields">
        <legend>Limits</legend>
        <p className="admin-hint">Leave a limit blank to use the plan&apos;s value.</p>
        {limitKeys.map((key) => {
          const field = form.limits[key];
          const fallback = planValue(key);
          const inputId = `limit-${key}`;
          return (
            <div className="admin-limit-field" key={key}>
              <label htmlFor={inputId}>{LIMITS[key].label}</label>
              <input
                id={inputId}
                inputMode="numeric"
                placeholder={field.unlimited ? "Unlimited" : fallback ? `Plan: ${fallback}` : "Plan default"}
                value={field.unlimited ? "" : field.value}
                disabled={field.unlimited}
                aria-invalid={invalid?.key === key || undefined}
                aria-describedby={invalid?.key === key ? `${inputId}-error` : undefined}
                onChange={(event) => setForm({ ...form, limits: { ...form.limits, [key]: { ...field, value: event.target.value } } })}
              />
              <label className="admin-check">
                <input type="checkbox" checked={field.unlimited} onChange={(event) => setForm({ ...form, limits: { ...form.limits, [key]: { ...field, unlimited: event.target.checked } } })} />
                Unlimited
              </label>
              {invalid?.key === key ? <p id={`${inputId}-error`} className="form-error admin-limit-error" role="alert">{invalid.message}</p> : null}
            </div>
          );
        })}
      </fieldset>
      <fieldset className="admin-limits-fields">
        <legend>Features</legend>
        {featureKeys.map((key) => {
          const fallback = planValue(key);
          return (
            <div className="admin-limit-field is-feature" key={key}>
              <label htmlFor={`feature-${key}`}>{FEATURES[key]}</label>
              <select id={`feature-${key}`} value={form.features[key]} onChange={(event) => setForm({ ...form, features: { ...form.features, [key]: event.target.value as FeatureField } })}>
                <option value="plan">{fallback ? `Plan default (${fallback})` : "Plan default"}</option>
                <option value="on">On for this workspace</option>
                <option value="off">Off for this workspace</option>
              </select>
            </div>
          );
        })}
      </fieldset>
    </>
  );
}

export function WorkspaceDetailScreen({
  workspace,
  entitlement,
  plans = [],
  activity,
  initialTab = "overview",
}: {
  workspace: AdminWorkspaceDetail;
  entitlement?: WorkspaceEntitlement;
  plans?: Array<{ id: string; key: string; name: string; isActive: boolean }>;
  /** Omitted when the audit log could not be read; the Activity tab is then left out. */
  activity?: WorkspaceActivityEvent[];
  initialTab?: string;
}) {
  const router = useRouter();
  const tabs = WORKSPACE_TABS.filter((tab) => tab !== "activity" || activity !== undefined);
  const { tab, select, onKeyDown, refs } = useTabs(initialTab as WorkspaceTab, tabs);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [exportFormat, setExportFormat] = useState<"csv" | "json">("csv");
  const [planId, setPlanId] = useState(entitlement?.plan.id ?? "");
  const [limitsForm, setLimitsForm] = useState<LimitsForm>(() => limitsFormFrom(entitlement?.overrides ?? {}));
  const [invalidLimit, setInvalidLimit] = useState<{ key: LimitKey; message: string } | null>(null);
  const actionsAnchor = useRef<HTMLDivElement>(null);

  const phrase = `SUSPEND ${workspace.slug}`;
  const suspended = workspace.status === "SUSPENDED";
  // A workspace queued for deletion is locked; lifecycle changes would overwrite that lock.
  const deletionLocked = Boolean(workspace.deletionScheduledAt) || workspace.status === "DELETION_PENDING";
  const members = workspace.members ?? [];
  const accounts = [
    ...(workspace.instagramConnections ?? []).map((item) => ({ id: item.id, name: `@${item.username}`, search: item.username, type: "Instagram", status: item.status, connectedAt: item.connectedAt, tokenExpiresAt: item.tokenExpiresAt })),
    ...(workspace.facebookConnections ?? []).map((item) => ({ id: item.id, name: item.pageName, search: item.pageName, type: "Facebook Page", status: item.status, connectedAt: item.connectedAt, tokenExpiresAt: item.tokenExpiresAt })),
  ];
  const assignablePlans = plans.filter((plan) => plan.isActive || plan.id === entitlement?.plan.id);
  const owner = members.find((member) => member.role === "OWNER");
  const planName = entitlement?.effectivePlan?.name ?? workspace.planName;
  const usage = { ...workspace, deliveriesReserved: entitlement?.usage.deliveriesReserved, broadcastsCreated: entitlement?.usage.broadcastsCreated };
  const rows = entitlement ? limitKeys.map((key) => usageRow(key, usage, entitlement.effective, entitlement.defaults, entitlement.overrides)) : [];
  const topRows = rows.filter((row) => row.percent !== null).sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0)).slice(0, 3);
  const accountsHealth = (hash: string) => `/admin/integrations?workspaceId=${encodeURIComponent(workspace.id)}${hash ? `&text=${encodeURIComponent(hash)}` : ""}`;

  const problems: Array<{ tone: "warning" | "danger"; text: React.ReactNode; tab?: WorkspaceTab }> = [];
  if (deletionLocked) problems.push({ tone: "danger", text: "Queued for permanent deletion. It can't be suspended or reactivated." });
  if (suspended) problems.push({ tone: "danger", text: <>Suspended{workspace.suspendedReason ? `: ${workspace.suspendedReason}` : "."}</> });
  for (const account of accounts.filter((item) => isProblemStatus(item.status))) {
    problems.push({ tone: "danger", text: <>{account.name} is {account.status === "EXPIRED" ? "expired" : "disconnected"}, so its automations can&apos;t reply.</>, tab: "accounts" });
  }
  for (const row of rows.filter((item) => item.tone !== "normal")) {
    problems.push({ tone: row.tone === "danger" ? "danger" : "warning", text: <>{(row.percent ?? 0) > 100 ? "Over the limit for" : row.tone === "danger" ? "At the limit for" : "Close to the limit for"} {row.label.toLowerCase()}: {formatCount(row.used ?? 0)} of {formatCount(row.limit ?? 0)}.</>, tab: "usage" });
  }
  const failedActions = (activity ?? []).filter((event) => event.phase === "FAILURE").slice(0, 3);
  for (const event of failedActions) {
    problems.push({ tone: "warning", text: <>Failed: {describeAuditAction(event.action)}{event.errorCode ? ` (${humanizeAdminCode(event.errorCode).toLowerCase()})` : ""}.</>, tab: "activity" });
  }

  function open(next: Action) {
    setDialogError(null);
    setNotice(null);
    setConfirmation("");
    setInvalidLimit(null);
    if (next === "plan") {
      setPlanId(entitlement?.plan.id ?? "");
      setLimitsForm(limitsFormFrom(entitlement?.overrides ?? {}));
    }
    setAction(next);
  }

  function close() {
    setAction(null);
    setDialogError(null);
    actionsAnchor.current?.querySelector("button")?.focus();
  }

  async function run<T>(command: () => Promise<T>, success: string | ((result: T) => string), refresh = true) {
    setBusy(true);
    setDialogError(null);
    try {
      const result = await command();
      setNotice({ tone: "success", text: typeof success === "string" ? success : success(result) });
      setAction(null);
      actionsAnchor.current?.querySelector("button")?.focus();
      if (refresh) router.refresh();
    } catch (cause) {
      setDialogError(adminErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function confirm(reason: string) {
    if (action === "suspend" || action === "restore") {
      const lifecycle = action === "suspend" ? "SUSPEND" : "RESTORE";
      if (lifecycle === "SUSPEND" && confirmation !== phrase) {
        setDialogError(`Type ${phrase} exactly to continue.`);
        return;
      }
      void run(
        () => adminCommand(`/api/admin/workspaces/${workspace.id}/lifecycle`, { body: { action: lifecycle, version: workspace.version }, reason }),
        lifecycle === "SUSPEND" ? "Workspace suspended." : "Workspace reactivated.",
      );
    } else if (action === "pause") {
      void run(
        () => adminCommand<{ paused: number }>(`/api/admin/workspaces/${workspace.id}/automations/pause`, { body: { version: workspace.version }, reason }),
        (data) => `${data?.paused ?? 0} live automations paused.`,
      );
    } else if (action === "resume") {
      void run(
        () => adminCommand<{ resumed: number; skipped: number }>(`/api/admin/workspaces/${workspace.id}/automations/resume`, { body: { version: workspace.version }, reason }),
        (data) => `${data?.resumed ?? 0} automations resumed.${data?.skipped ? ` ${data.skipped} changed since the pause and stay as they are.` : ""}`,
      );
    } else if (action === "export") {
      const format = exportFormat;
      void run(
        async () => {
          const response = await adminCommandResponse(`/api/admin/workspaces/${workspace.id}/export`, { body: { format }, reason, fallback: "workspace_export_failed" });
          downloadAdminFile(await response.blob(), `linkar-workspace-${workspace.id}.${format}`);
        },
        `${format.toUpperCase()} export downloaded.`,
        false,
      );
    } else if (action === "plan") {
      if (!entitlement) {
        setDialogError("This workspace has no plan record yet.");
        return;
      }
      const result = overridesFrom(limitsForm);
      if (!result.ok) {
        setInvalidLimit({ key: result.key, message: result.message });
        document.getElementById(`limit-${result.key}`)?.focus();
        return;
      }
      setInvalidLimit(null);
      void run(
        () => adminCommand(`/api/admin/workspaces/${workspace.id}/entitlement`, { method: "PATCH", body: { planId, overrides: result.overrides, version: entitlement.version }, reason }),
        "Plan and limits saved.",
      );
    }
  }

  const menuItems = [
    { action: "plan" as const, label: "Change plan & limits", icon: <SlidersHorizontal size={16} aria-hidden />, disabled: entitlement ? undefined : "No plan record yet" },
    { action: "pause" as const, label: "Pause live automations", icon: <PauseCircle size={16} aria-hidden /> },
    { action: "resume" as const, label: "Resume paused automations", icon: <PlayCircle size={16} aria-hidden />, disabled: deletionLocked ? "Queued for deletion" : suspended ? "Reactivate the workspace first" : undefined },
    suspended
      ? { action: "restore" as const, label: "Reactivate workspace", icon: <RotateCcw size={16} aria-hidden />, disabled: deletionLocked ? "Queued for deletion" : undefined }
      : { action: "suspend" as const, label: "Suspend workspace", icon: <Ban size={16} aria-hidden />, danger: true, disabled: deletionLocked ? "Queued for deletion" : undefined },
    { action: "export" as const, label: "Export data", icon: <Download size={16} aria-hidden /> },
  ];

  const panelProps = (id: WorkspaceTab) => ({ id: `workspace-panel-${id}`, role: "tabpanel", "aria-labelledby": `workspace-tab-${id}`, tabIndex: 0, hidden: tab !== id });

  return (
    <main className="page-wrap admin-page workspace-detail">
      <PageHeader
        back={<Link className="admin-back" href="/admin/workspaces"><ArrowLeft size={16} aria-hidden /> All workspaces</Link>}
        title={workspace.name}
        description={(
          <span className="workspace-meta">
            <span>{workspace.slug}</span>
            <span>Created <RelativeTime inline value={workspace.createdAt} /></span>
            {owner ? <span>Owner {owner.email}</span> : null}
            <span className="workspace-meta-badges">
              <StatusPill status={workspace.status} />
              <span className="plan-tag">{planName}</span>
            </span>
          </span>
        )}
        actions={<div ref={actionsAnchor}><ActionsMenu items={menuItems} onPick={open} /></div>}
      />

      {notice ? (
        notice.tone === "error"
          ? <div className="form-error admin-message" role="alert">{notice.text}</div>
          : <div className="form-success admin-message" role="status">{notice.text}</div>
      ) : null}

      <div className="admin-tabs" role="tablist" aria-label="Workspace sections">
        {tabs.map((id) => (
          <button
            key={id}
            ref={(element) => { refs.current[id] = element; }}
            id={`workspace-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`workspace-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className={tab === id ? "is-active" : undefined}
            onClick={() => select(id)}
            onKeyDown={onKeyDown}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </div>

      <section {...panelProps("overview")} className="workspace-panel">
        <div className="workspace-glance" aria-label="At a glance">
          <div><span>Plan</span><strong>{planName}</strong></div>
          <div><span>Members</span><strong>{formatCount(workspace.memberCount)}</strong></div>
          <div><span>Automations</span><strong>{formatCount(workspace.automationCount)}</strong></div>
          <div><span>Connected accounts</span><strong>{formatCount(workspace.instagramConnectionCount + workspace.facebookConnectionCount)}</strong><small>{plural(workspace.instagramConnectionCount, "Instagram account")}, {plural(workspace.facebookConnectionCount, "Facebook Page")}</small></div>
        </div>
        <div className="admin-columns">
          <section className="admin-card" aria-labelledby="overview-usage-title">
            <div className="admin-card-head">
              <h2 id="overview-usage-title">Usage</h2>
              {entitlement ? <button type="button" className="button button-ghost button-small" onClick={() => select("usage", true)}>All limits</button> : null}
            </div>
            {topRows.length ? <ul className="usage-list">{topRows.map((row) => <UsageLine key={row.key} row={row} />)}</ul> : <p className="admin-hint">{entitlement ? "Every limit on this plan is unlimited." : "This workspace has no plan record yet."}</p>}
          </section>
          <section className="admin-card" aria-labelledby="overview-problems-title">
            <div className="admin-card-head">
              <h2 id="overview-problems-title">Recent problems</h2>
            </div>
            {problems.length === 0
              ? <StatusBadge tone="success" label="Nothing needs attention" />
              : (
                <ul className="workspace-problems">
                  {problems.map((problem, index) => (
                    <li key={index} className={`is-${problem.tone}`}>
                      <span className="health-problem-dot" aria-hidden />
                      <span>{problem.text}</span>
                      {problem.tab ? <button type="button" className="text-link" onClick={() => select(problem.tab!, true)}>View</button> : null}
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </div>
        <p className="admin-results workspace-ids">
          <IdChip id={workspace.id} prefix="Workspace ID" />
          <span>Last changed <RelativeTime inline value={workspace.updatedAt} /></span>
        </p>
      </section>

      <section {...panelProps("usage")} className="workspace-panel">
        {entitlement ? (
          <>
            {entitlement.premiumExpiresAt ? (
              <p className="admin-callout"><Info size={16} aria-hidden /><span>Invite-code access to {entitlement.effectivePlan?.name ?? "a premium plan"} is active until <RelativeTime inline value={entitlement.premiumExpiresAt} />. Plan and limit changes take effect after that.</span></p>
            ) : null}
            <section className="admin-card" aria-labelledby="usage-title">
              <div className="admin-card-head">
                <div>
                  <h2 id="usage-title">Usage & limits</h2>
                  <p>{entitlement.plan.name} plan. Monthly counts started <RelativeTime inline value={entitlement.usage.periodStart} />.</p>
                </div>
                <button type="button" className="button button-secondary button-small" onClick={() => open("plan")}>Change plan & limits</button>
              </div>
              <ul className="usage-list">{rows.map((row) => <UsageLine key={row.key} row={row} />)}</ul>
            </section>
            <section className="admin-card" aria-labelledby="features-title">
              <div className="admin-card-head"><h2 id="features-title">Features</h2></div>
              <ul className="admin-readiness workspace-features">
                {featureKeys.map((key) => {
                  const on = entitlement.effective[key] === true;
                  const custom = entitlement.overrides[key] !== undefined;
                  return (
                    <li key={key}>
                      <span className="admin-readiness-row">
                        <span>{FEATURES[key]}{custom ? <small> (custom for this workspace)</small> : null}</span>
                        <span className="workspace-feature-value">{on ? "On" : "Off"}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        ) : <p className="admin-callout"><Info size={16} aria-hidden /><span>This workspace has no plan record yet, so it has no limits to show.</span></p>}
      </section>

      <section {...panelProps("members")} className="workspace-panel">
        <div className="admin-card is-flush">
          {members.length === 0 ? <div className="admin-empty"><p>This workspace has no members.</p></div> : (
            <div className="table-scroll">
              <table className="data-table is-stackable" aria-label="Members">
                <thead><tr><th>Person</th><th>Role</th><th>Status</th></tr></thead>
                <tbody>{members.map((member) => (
                  <tr key={`${member.userId}-${member.email}`}>
                    <td>
                      <span className="cell-stack">
                        {member.userId ? <Link href={`/admin/users/${member.userId}`}>{member.email}</Link> : <strong>{member.email}</strong>}
                        {member.userId ? <span className="cell-meta"><IdChip id={member.userId} prefix="User ID" /></span> : null}
                      </span>
                    </td>
                    <td data-label="Role">{roleLabel(member.role)}</td>
                    <td data-label="Status">{member.userId ? <StatusBadge tone="success" label="Joined" /> : <StatusBadge tone="neutral" label="Invited, not signed in yet" />}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section {...panelProps("accounts")} className="workspace-panel">
        <div className="admin-card is-flush">
          {accounts.length === 0 ? <div className="admin-empty"><p>No Instagram accounts or Facebook Pages are connected.</p></div> : (
            <div className="table-scroll">
              <table className="data-table is-stackable" aria-label="Connected accounts">
                <thead><tr><th>Account</th><th>Status</th><th>Connected</th><th>Access expires</th><th className="is-action"><span className="sr-only">Action</span></th></tr></thead>
                <tbody>{accounts.map((account) => (
                  <tr key={account.id}>
                    <td><span className="cell-stack"><strong>{account.name}</strong><span className="cell-meta">{account.type}</span></span></td>
                    <td data-label="Status"><StatusPill status={account.status} /></td>
                    <td data-label="Connected"><RelativeTime value={account.connectedAt} /></td>
                    <td data-label="Access expires"><RelativeTime value={account.tokenExpiresAt ?? null} fallback="Not set" /></td>
                    <td className="is-action"><Link className="button button-ghost button-small" href={accountsHealth(account.search)} aria-label={`Check account health for ${account.name}`}>Check account health</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {activity !== undefined ? (
        <section {...panelProps("activity")} className="workspace-panel">
          <div className="admin-results">
            <span>{activity.length ? `Latest ${plural(activity.length, "admin action")} on this workspace` : "No admin actions on this workspace yet"}</span>
            <Link className="text-link" href="/admin/audit">Open audit log</Link>
          </div>
          {activity.length ? (
            <div className="admin-card is-flush">
              <ol className="admin-activity">
                {activity.map((event) => {
                  const failed = event.phase === "FAILURE";
                  return (
                    <li key={event.id}>
                      <span className={`admin-activity-dot is-${failed ? "danger" : event.phase === "SUCCESS" ? "success" : "neutral"}`} aria-hidden />
                      <div className="admin-activity-body">
                        <strong>{describeAuditAction(event.action)}</strong>
                        {event.reason ? <p>{event.reason}</p> : null}
                        <div className="cell-meta">
                          <span>by {event.actorEmail}</span>
                          {event.phase !== "SUCCESS" ? <StatusBadge tone={failed ? "danger" : "neutral"} label={failed ? "Failed" : "Started"} /> : null}
                          {event.errorCode ? <span>{humanizeAdminCode(event.errorCode)}</span> : null}
                        </div>
                      </div>
                      <RelativeTime value={typeof event.createdAt === "string" ? event.createdAt : event.createdAt.toISOString()} className="admin-activity-time" />
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}
        </section>
      ) : null}

      {action === "plan" && entitlement ? (
        <ReasonDialog
          wide
          title="Change plan & limits"
          intro="Pick the plan, then set any limits that should differ from it for this workspace only."
          busy={busy}
          error={dialogError}
          confirmLabel="Save plan and limits"
          onCancel={close}
          onConfirm={confirm}
        >
          {entitlement.premiumExpiresAt ? <p className="admin-callout"><Info size={16} aria-hidden /><span>Invite-code access is active until <RelativeTime inline value={entitlement.premiumExpiresAt} />. These changes take effect after that.</span></p> : null}
          <label className="field">
            <span>Plan</span>
            <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
              {assignablePlans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name}{plan.isActive ? "" : " (retired)"}</option>)}
            </select>
          </label>
          <LimitsFields form={limitsForm} setForm={setLimitsForm} defaults={entitlement.defaults} samePlan={planId === entitlement.plan.id} invalid={invalidLimit} />
        </ReasonDialog>
      ) : null}

      {action === "pause" ? (
        <ReasonDialog
          title="Pause live automations"
          intro="Stops every live automation in this workspace. People can still sign in, and you can resume them later."
          busy={busy}
          error={dialogError}
          confirmLabel="Pause live automations"
          onCancel={close}
          onConfirm={confirm}
        />
      ) : null}

      {action === "resume" ? (
        <ReasonDialog
          title="Resume paused automations"
          intro="Turns back on the automations the last pause stopped, except any changed since."
          busy={busy}
          error={dialogError}
          confirmLabel="Resume paused automations"
          onCancel={close}
          onConfirm={confirm}
        />
      ) : null}

      {action === "suspend" ? (
        <ReasonDialog
          danger
          title="Suspend workspace"
          warning="Everyone is locked out of this workspace and its automations stop until it is reactivated."
          busy={busy}
          error={dialogError}
          confirmLabel="Suspend workspace"
          onCancel={close}
          onConfirm={confirm}
        >
          <label className="field">
            <span>Type <code className="admin-phrase">{phrase}</code> to confirm</span>
            <input required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        </ReasonDialog>
      ) : null}

      {action === "restore" ? (
        <ReasonDialog
          title="Reactivate workspace"
          intro={<>Members can use this workspace again.{workspace.suspendedReason ? <> It was suspended because: {workspace.suspendedReason}</> : null}</>}
          busy={busy}
          error={dialogError}
          confirmLabel="Reactivate workspace"
          onCancel={close}
          onConfirm={confirm}
        />
      ) : null}

      {action === "export" ? (
        <ReasonDialog
          title="Export data"
          intro="Workspace details, members, contacts and automations. Passwords, access tokens and raw Meta data are never included. Workspaces over 50,000 rows must be exported offline."
          busy={busy}
          error={dialogError}
          confirmLabel={`Download ${exportFormat.toUpperCase()}`}
          onCancel={close}
          onConfirm={confirm}
        >
          <fieldset className="admin-segmented">
            <legend>Format</legend>
            <label><input type="radio" name="export-format" value="csv" checked={exportFormat === "csv"} onChange={() => setExportFormat("csv")} /> CSV</label>
            <label><input type="radio" name="export-format" value="json" checked={exportFormat === "json"} onChange={() => setExportFormat("json")} /> JSON</label>
          </fieldset>
        </ReasonDialog>
      ) : null}
    </main>
  );
}
