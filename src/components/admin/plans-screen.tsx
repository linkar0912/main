"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Ban, Check, Copy, Plus, Save } from "lucide-react";

import { PageHeader } from "@/src/components/page-header";
import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import { ActionNotice } from "../action-notice";
import { AdminCommandError, adminCommand, adminErrorMessage } from "./shared/admin-request";
import { REASON_LABEL, ReasonDialog } from "./shared/reason-dialog";
import { StatusPill } from "./shared/status-pill";

type Plan = {
  id: string; key: string; name: string; isActive: boolean; version: number; workspaceCount: number;
  memberLimit: number | null; automationLimit: number | null; instagramConnectionLimit: number | null;
  facebookConnectionLimit: number | null; sequenceLimit: number | null; monthlyBroadcastLimit: number | null; monthlyDeliveryLimit: number | null;
  sequencesEnabled: boolean; broadcastsEnabled: boolean; trackedLinksEnabled: boolean; teamEnabled: boolean; facebookEnabled: boolean; exportsEnabled: boolean;
};
type Values = Omit<Plan, "id" | "key" | "isActive" | "version" | "workspaceCount">;
type InviteCode = {
  id: string; label: string; durationDays: number; expiresAt: string | null; revokedAt: string | null; createdAt: string;
  plan: { key: string; name: string };
  redemption: null | { workspaceId: string; startsAt: string; expiresAt: string; createdAt: string };
};
type Notice = { tone: "error" | "success"; message: string };

// New workspaces are created on this plan; the server refuses to retire it.
const DEFAULT_PLAN_KEY = "free";

const limitFields = [
  ["memberLimit", "Members"],
  ["automationLimit", "Automations"],
  ["instagramConnectionLimit", "Instagram accounts"],
  ["facebookConnectionLimit", "Facebook Pages"],
  ["sequenceLimit", "Sequences"],
  ["monthlyBroadcastLimit", "Broadcasts a month"],
  ["monthlyDeliveryLimit", "Messages a month"],
] as const;
const featureFields = [
  ["sequencesEnabled", "Sequences"],
  ["broadcastsEnabled", "Broadcasts"],
  ["trackedLinksEnabled", "Tracked links"],
  ["teamEnabled", "Team access"],
  ["facebookEnabled", "Facebook"],
  ["exportsEnabled", "Exports"],
] as const;
const defaults: Values = {
  name: "", memberLimit: 2, automationLimit: 3, instagramConnectionLimit: 1, facebookConnectionLimit: 0, sequenceLimit: 0,
  monthlyBroadcastLimit: 0, monthlyDeliveryLimit: 100, sequencesEnabled: false, broadcastsEnabled: false, trackedLinksEnabled: false,
  teamEnabled: false, facebookEnabled: false, exportsEnabled: false,
};

function editableValues(plan: Plan): Values {
  // Only editable fields are sent back; serialized timestamps would fail strict validation.
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, plan[key as keyof Values]])) as Values;
}

function inviteState(item: InviteCode): "used" | "revoked" | "expired" | "ready" {
  if (item.redemption) return "used";
  if (item.revokedAt) return "revoked";
  return item.expiresAt && new Date(item.expiresAt) <= new Date() ? "expired" : "ready";
}

function workspaces(count: number): string {
  return `${count.toLocaleString("en-IN")} ${count === 1 ? "workspace" : "workspaces"}`;
}

function PlanFields({ value, onChange }: { value: Values; onChange: (value: Values) => void }) {
  return (
    <>
      <label className="field">
        <span>Plan name</span>
        <input required maxLength={80} value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
      </label>
      <fieldset className="admin-fieldset">
        <legend>Limits</legend>
        <p className="admin-hint">Leave a limit empty for unlimited.</p>
        <div className="admin-fieldset-grid">
          {limitFields.map(([key, label]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={value[key] ?? ""}
                placeholder="Unlimited"
                onChange={(event) => onChange({ ...value, [key]: event.target.value === "" ? null : Number(event.target.value) })}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="admin-fieldset">
        <legend>Features</legend>
        <div className="admin-fieldset-grid is-checks">
          {featureFields.map(([key, label]) => (
            <label className="admin-check" key={key}>
              <input type="checkbox" checked={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} /> {label}
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

function LocalNotice({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  return notice ? <ActionNotice tone={notice.tone} message={notice.message} onDismiss={onDismiss} /> : null;
}

function PlanEditor({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [value, setValue] = useState<Values>(() => editableValues(plan));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingRetire, setConfirmingRetire] = useState(false);
  const [confirmingSave, setConfirmingSave] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const reasonReady = reason.trim().length >= 3;
  const defaultPlan = plan.key === DEFAULT_PLAN_KEY;

  async function run(method: "PATCH" | "DELETE", body: unknown, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      await adminCommand(`/api/admin/plans/${plan.id}`, { method, body, reason, fallback: "plan_operation_failed" });
      setConfirmingRetire(false);
      setConfirmingSave(false);
      setNotice({ tone: "success", message: success });
      router.refresh();
    } catch (cause) {
      setNotice({ tone: "error", message: adminErrorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    // Plan edits apply to every assigned workspace at once, so a plan in use
    // needs a second, explicit confirmation that names how many are affected.
    if (plan.workspaceCount > 0 && !confirmingSave) {
      setConfirmingRetire(false);
      setConfirmingSave(true);
      return;
    }
    void run("PATCH", { ...value, version: plan.version }, `${value.name} saved.`);
  }

  function retire() {
    // The retire button sits outside form submission, so the reason is checked here.
    if (!reasonReady) {
      setNotice({ tone: "error", message: "Add a reason before retiring a plan." });
      return;
    }
    void run("DELETE", { version: plan.version }, `${plan.name} retired.`);
  }

  return (
    <form className="admin-card" onSubmit={save}>
      <div className="admin-card-head">
        <div>
          <h3>{plan.name}</h3>
          <p>{plan.workspaceCount ? `${workspaces(plan.workspaceCount)} on this plan` : "No workspaces on this plan yet"}</p>
        </div>
        <StatusPill status={plan.isActive ? "active" : "retired"} label={plan.isActive ? "Available" : "Retired"} />
      </div>
      {/* A retired plan stays attached to its workspaces but can no longer be edited. */}
      <fieldset className="admin-plain-fieldset" disabled={!plan.isActive}>
        <PlanFields value={value} onChange={(next) => { setValue(next); setConfirmingSave(false); }} />
        <label className="field">
          <span>{REASON_LABEL}</span>
          <input required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      </fieldset>
      {confirmingSave ? <p className="admin-callout" role="status">Saving changes the limits of {workspaces(plan.workspaceCount)} immediately.</p> : null}
      {confirmingRetire ? <p className="admin-callout">Retiring stops new workspaces from getting this plan. The {workspaces(plan.workspaceCount)} already on it keep it.</p> : null}
      {plan.isActive ? (
        <div className="admin-actions">
          {confirmingSave ? (
            <>
              <button className="button button-primary" disabled={busy} type="submit"><Save size={16} aria-hidden /> Confirm save</button>
              <button className="button button-ghost" disabled={busy} type="button" onClick={() => setConfirmingSave(false)}>Keep editing</button>
            </>
          ) : <button className="button button-primary" disabled={busy} type="submit"><Save size={16} aria-hidden /> Save plan</button>}
          {defaultPlan ? null : confirmingRetire ? (
            <>
              <button className="button button-danger" disabled={busy} type="button" onClick={retire}><Archive size={16} aria-hidden /> Confirm retire</button>
              <button className="button button-ghost" disabled={busy} type="button" onClick={() => setConfirmingRetire(false)}>Keep plan</button>
            </>
          ) : (
            <button className="button button-secondary" disabled={busy} type="button" onClick={() => { setConfirmingSave(false); setConfirmingRetire(true); }}><Archive size={16} aria-hidden /> Retire plan</button>
          )}
        </div>
      ) : <p className="admin-hint">Retired plans are read-only. Workspaces already on it keep these limits.</p>}
      {defaultPlan && plan.isActive ? <p className="admin-hint">New workspaces start on this plan, so it cannot be retired.</p> : null}
      <LocalNotice notice={notice} onDismiss={() => setNotice(null)} />
    </form>
  );
}

type InviteCommand = { type: "revoke" | "end_access"; item: InviteCode };

function PremiumInviteManager({ plans, inviteCodes }: { plans: Plan[]; inviteCodes: InviteCode[] }) {
  const router = useRouter();
  const availablePlans = plans.filter((plan) => plan.isActive && plan.key !== DEFAULT_PLAN_KEY);
  const [selectedPlanKey, setSelectedPlanKey] = useState(() => availablePlans[0]?.key ?? "");
  const selectedPlan = availablePlans.find((plan) => plan.key === selectedPlanKey) ?? availablePlans[0] ?? null;
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdCode, setCreatedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [listNotice, setListNotice] = useState<Notice | null>(null);
  const [command, setCommand] = useState<InviteCommand | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setCreatedCode("");
    setCopied(false);
    try {
      if (!selectedPlan) {
        setNotice({ tone: "error", message: "No paid plan is available for invite codes." });
        return;
      }
      const data = await adminCommand<{ code?: string; plan?: { key: string; name: string } }>("/api/admin/invite-codes", {
        body: { label, planKey: selectedPlan.key, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null },
        reason,
        fallback: "invite_code_create_failed",
      });
      if (!data?.code || !data.plan) {
        setNotice({ tone: "error", message: "The invite code could not be created." });
        return;
      }
      setCreatedCode(data.code);
      setLabel("");
      setExpiresAt("");
      setReason("");
      setNotice({ tone: "success", message: `${data.plan.name} invite code created.` });
      router.refresh();
    } catch (cause) {
      setNotice({ tone: "error", message: adminErrorMessage(cause) });
    } finally {
      setBusy(false);
    }
  }

  async function execute(commandReason: string) {
    if (!command) return;
    setBusy(true);
    setCommandError(null);
    const { item, type } = command;
    try {
      await adminCommand(type === "revoke" ? `/api/admin/invite-codes/${item.id}` : `/api/admin/invite-codes/${item.id}/access`, {
        method: "DELETE",
        reason: commandReason,
        fallback: type === "revoke" ? "invite_code_revoke_failed" : "premium_access_end_failed",
      });
      setCommand(null);
      setListNotice({ tone: "success", message: type === "revoke" ? `${item.label} revoked.` : `Premium access from ${item.label} ended.` });
      router.refresh();
    } catch (cause) {
      if (cause instanceof AdminCommandError && cause.status === 404) {
        // Another operator removed it or the list is stale; show the current list.
        setCommand(null);
        setListNotice({ tone: "error", message: type === "revoke" ? `${item.label} no longer exists. The list has been refreshed.` : `${item.label} has no premium access to end. The list has been refreshed.` });
        router.refresh();
      } else {
        setCommandError(adminErrorMessage(cause));
      }
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(createdCode);
      setCopied(true);
    } catch {
      setNotice({ tone: "error", message: "Copy failed. Select the code and copy it yourself." });
    }
  }

  return (
    <section className="admin-section" aria-labelledby="invites-title">
      <div className="admin-section-title">
        <div>
          <h2 id="invites-title">Invite codes</h2>
          <p>Each code gives one workspace 30 days on a paid plan. The code is shown only once.</p>
        </div>
      </div>

      <form className="admin-card" onSubmit={create}>
        <div className="admin-card-head"><h3>Create an invite code</h3></div>
        <label className="field">
          <span>Invite plan</span>
          <select required disabled={availablePlans.length === 0} value={selectedPlan?.key ?? ""} onChange={(event) => setSelectedPlanKey(event.target.value)}>
            {availablePlans.length === 0
              ? <option value="">No paid plans available</option>
              : availablePlans.map((plan) => <option key={plan.id} value={plan.key}>{plan.name}</option>)}
          </select>
        </label>
        {selectedPlan ? (
          <div className="admin-plan-summary">
            <div className="admin-list-main"><span className="admin-hint">Selected access</span><strong>{selectedPlan.name}</strong></div>
            <dl>
              {limitFields.map(([key, fieldLabel]) => (
                <div key={key}><dt>{fieldLabel}</dt><dd>{selectedPlan[key] === null ? "Unlimited" : selectedPlan[key].toLocaleString("en-IN")}</dd></div>
              ))}
            </dl>
          </div>
        ) : <p className="admin-callout">Create or bring back a paid plan before making an invite code.</p>}
        <div className="admin-form-row">
          <label className="field">
            <span>Internal label</span>
            <input required minLength={2} maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="October creator cohort" />
          </label>
          <label className="field">
            <span>Code expires <em>optional</em></span>
            <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
          </label>
          <label className="field">
            <span>{REASON_LABEL}</span>
            <input required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
        </div>
        <div className="admin-actions">
          <button className="button button-primary" disabled={busy || !selectedPlan} type="submit"><Plus size={16} aria-hidden /> Generate code</button>
        </div>
        {createdCode ? (
          <div className="admin-created-code">
            <code>{createdCode}</code>
            <button className="button button-secondary button-small" type="button" onClick={() => void copyCode()}>
              {copied ? <><Check size={14} aria-hidden /> Copied</> : <><Copy size={14} aria-hidden /> Copy</>}
            </button>
          </div>
        ) : null}
        <LocalNotice notice={notice} onDismiss={() => setNotice(null)} />
      </form>

      <LocalNotice notice={listNotice} onDismiss={() => setListNotice(null)} />
      <div className="admin-card is-flush">
        {inviteCodes.length === 0 ? <div className="admin-empty"><p>No invite codes yet. Codes you generate appear here.</p></div> : (
          <ul className="admin-list">
            {inviteCodes.map((item) => {
              const state = inviteState(item);
              const accessActive = Boolean(item.redemption && new Date(item.redemption.expiresAt) > new Date());
              return (
                <li key={item.id}>
                  <span className="admin-list-main">
                    <strong>{item.label}</strong>
                    <span className="cell-meta">
                      <span>{item.plan.name}, {item.durationDays} days</span>
                      <span>Created <RelativeTime inline value={item.createdAt} /></span>
                      <span>{item.expiresAt ? <>Code expires <RelativeTime inline value={item.expiresAt} /></> : "code does not expire"}</span>
                    </span>
                    {item.redemption ? (
                      <span className="cell-meta">
                        <span>Used by</span><IdChip id={item.redemption.workspaceId} prefix="Workspace" />
                        <span>access {accessActive ? "ends" : "ended"} <RelativeTime inline value={item.redemption.expiresAt} /></span>
                      </span>
                    ) : null}
                  </span>
                  <span className="admin-list-side">
                    <StatusPill status={state} label={state === "ready" ? "Ready to use" : undefined} tone={state === "ready" ? "success" : undefined} />
                    {state === "ready" ? (
                      <button className="button button-secondary button-small" type="button" disabled={busy} aria-label={`Revoke ${item.label}`} onClick={() => { setCommandError(null); setCommand({ type: "revoke", item }); }}><Ban size={14} aria-hidden /> Revoke</button>
                    ) : null}
                    {accessActive ? (
                      <button className="button button-secondary button-small" type="button" disabled={busy} aria-label={`End premium access from ${item.label}`} onClick={() => { setCommandError(null); setCommand({ type: "end_access", item }); }}><Ban size={14} aria-hidden /> End access</button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {command ? (
        <ReasonDialog
          title={command.type === "revoke" ? `Revoke ${command.item.label}` : `End premium access from ${command.item.label}`}
          warning={command.type === "revoke"
            ? "The code can no longer be used. Access already given by other codes is not affected."
            : "The workspace goes back to its own plan now instead of when this access was due to end."}
          busy={busy}
          error={commandError}
          danger
          confirmLabel={command.type === "revoke" ? "Revoke code" : "End access"}
          onCancel={() => setCommand(null)}
          onConfirm={(commandReason) => void execute(commandReason)}
        />
      ) : null}
    </section>
  );
}

export function PlansScreen({ plans, inviteCodes = [] }: { plans: Plan[]; inviteCodes?: InviteCode[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState(defaults);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setNotice(null);
    try {
      await adminCommand("/api/admin/plans", { body: { key, ...value }, reason, fallback: "plan_operation_failed" });
      setNotice({ tone: "success", message: `${value.name} created.` });
      setKey("");
      setValue(defaults);
      setReason("");
      router.refresh();
    } catch (cause) {
      setNotice({ tone: "error", message: adminErrorMessage(cause) });
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="page-wrap admin-page">
      <PageHeader title="Plans and invites" description="What each plan includes, and invite codes that give paid access for free." />

      <PremiumInviteManager plans={plans} inviteCodes={inviteCodes} />

      <section className="admin-section" aria-label="Plan templates">
        <div className="admin-section-title">
          <div>
            <h2>Plans</h2>
            <p>Empty limits mean unlimited. Retired plans stay on the workspaces that already have them.</p>
          </div>
        </div>
        {plans.map((plan) => <PlanEditor key={`${plan.id}:${plan.version}`} plan={plan} />)}

        <form className="admin-card" onSubmit={create}>
          <div className="admin-card-head">
            <div>
              <h3>Create a plan</h3>
              <p>The key is permanent and used in billing settings, for example growth.</p>
            </div>
          </div>
          <label className="field">
            <span>Plan key</span>
            <input required pattern="[a-z][a-z0-9_-]{1,39}" title="Lowercase letters, numbers, hyphens, or underscores; must start with a letter." value={key} onChange={(event) => setKey(event.target.value)} placeholder="growth" />
          </label>
          <PlanFields value={value} onChange={setValue} />
          <label className="field">
            <span>{REASON_LABEL}</span>
            <input required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <div className="admin-actions">
            <button className="button button-primary" disabled={creating} type="submit"><Plus size={16} aria-hidden /> Create plan</button>
          </div>
          <LocalNotice notice={notice} onDismiss={() => setNotice(null)} />
        </form>
      </section>
    </main>
  );
}
