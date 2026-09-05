"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Ban, Copy, Plus, Save, TicketCheck, WalletCards } from "lucide-react";
import { ActionNotice } from "../action-notice";

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
const limitFields = [["memberLimit", "Members"], ["automationLimit", "Automations"], ["instagramConnectionLimit", "Instagram connections"], ["facebookConnectionLimit", "Facebook connections"], ["sequenceLimit", "Sequences"], ["monthlyBroadcastLimit", "Monthly broadcasts"], ["monthlyDeliveryLimit", "Monthly deliveries"]] as const;
const featureFields = [["sequencesEnabled", "Sequences"], ["broadcastsEnabled", "Broadcasts"], ["trackedLinksEnabled", "Tracked links"], ["teamEnabled", "Team access"], ["facebookEnabled", "Facebook"], ["exportsEnabled", "Exports"]] as const;
const defaults: Values = { name: "", memberLimit: 2, automationLimit: 3, instagramConnectionLimit: 1, facebookConnectionLimit: 0, sequenceLimit: 0, monthlyBroadcastLimit: 0, monthlyDeliveryLimit: 100, sequencesEnabled: false, broadcastsEnabled: false, trackedLinksEnabled: false, teamEnabled: false, facebookEnabled: false, exportsEnabled: false };

async function mutate(url: string, method: string, body: unknown, reason: string) { const response = await fetch(url, { method, headers: { "content-type": "application/json", "x-admin-reason": reason, "idempotency-key": `admin-${crypto.randomUUID()}` }, body: JSON.stringify(body) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error ?? "plan_operation_failed"); }

function PlanFields({ value, onChange }: { value: Values; onChange: (value: Values) => void }) {
  return <><label className="field"><span>Display name</span><input required value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} /></label><fieldset className="admin-plan-fieldset"><legend>Resource limits</legend><p className="muted">Leave a limit empty for unlimited.</p><div className="admin-plan-limit-grid">{limitFields.map(([key, label]) => <label className="field" key={key}><span>{label}</span><input type="number" min="0" value={value[key] ?? ""} placeholder="Unlimited" onChange={(event) => onChange({ ...value, [key]: event.target.value === "" ? null : Number(event.target.value) })} /></label>)}</div></fieldset><fieldset className="admin-plan-fieldset"><legend>Features</legend><div className="admin-feature-grid">{featureFields.map(([key, label]) => <label className="admin-check-field" key={key}><input type="checkbox" checked={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.checked })} /> {label}</label>)}</div></fieldset></>;
}

function PlanEditor({ plan, onError }: { plan: Plan; onError: (message: string | null) => void }) {
  const router = useRouter(); const [value, setValue] = useState<Values>(() => { const { id: _id, key: _key, isActive: _active, version: _version, workspaceCount: _count, ...values } = plan; return values; }); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); onError(null); try { await mutate(`/api/admin/plans/${plan.id}`, "PATCH", { ...value, version: plan.version }, reason); router.refresh(); } catch (cause) { onError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Operation failed"); } finally { setBusy(false); } }
  async function retire() { setBusy(true); onError(null); try { await mutate(`/api/admin/plans/${plan.id}`, "DELETE", { version: plan.version }, reason); router.refresh(); } catch (cause) { onError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Operation failed"); } finally { setBusy(false); } }
  return <form className="panel admin-plan-card" onSubmit={save}><div className="panel-heading"><div><p className="eyebrow">{plan.key} · version {plan.version}</p><h2>{plan.name}</h2><p className="muted">{plan.workspaceCount} assigned workspaces · {plan.isActive ? "Active" : "Retired"}</p></div><span className={`status-pill is-${plan.isActive ? "active" : "suspended"}`}>{plan.isActive ? "active" : "retired"}</span></div><PlanFields value={value} onChange={setValue} /><label className="field"><span>Operator reason</span><input required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="admin-command-actions"><button className="button button-primary" disabled={busy || !plan.isActive} type="submit"><Save size={16} /> Save plan</button><button className="button button-secondary" disabled={busy || !plan.isActive} type="button" onClick={retire}><Archive size={16} /> Retire plan</button></div></form>;
}

function PremiumInviteManager({ plans, inviteCodes, onError, onSuccess }: { plans: Plan[]; inviteCodes: InviteCode[]; onError: (message: string | null) => void; onSuccess: (message: string) => void }) {
  const router = useRouter();
  const availablePlans = plans.filter((plan) => plan.isActive && plan.key !== "free");
  const [selectedPlanKey, setSelectedPlanKey] = useState(() => availablePlans[0]?.key ?? "");
  const selectedPlan = availablePlans.find((plan) => plan.key === selectedPlanKey) ?? availablePlans[0] ?? null;
  const [label, setLabel] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdCode, setCreatedCode] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); onError(null); setCreatedCode("");
    try {
      if (!selectedPlan) throw new Error("invite_plan_unavailable");
      const response = await fetch("/api/admin/invite-codes", { method: "POST", headers: { "content-type": "application/json", "x-admin-reason": reason, "idempotency-key": `admin-${crypto.randomUUID()}` }, body: JSON.stringify({ label, planKey: selectedPlan.key, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }) });
      const payload = await response.json() as { data?: { code?: string; plan?: { key: string; name: string } }; error?: string };
      if (!response.ok || !payload.data?.code || !payload.data.plan) throw new Error(payload.error ?? "invite_code_create_failed");
      setCreatedCode(payload.data.code); setLabel(""); setExpiresAt(""); setReason(""); onSuccess(`${payload.data.plan.name} invite code created.`); router.refresh();
    } catch (cause) { onError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Operation failed"); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (!reason.trim()) { onError("Add an operator reason before revoking a code."); return; }
    setBusy(true); onError(null);
    try { await mutate(`/api/admin/invite-codes/${id}`, "DELETE", {}, reason); router.refresh(); }
    catch (cause) { onError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Operation failed"); }
    finally { setBusy(false); }
  }
  return <section className="admin-invite-section"><div className="panel-heading"><div><p className="eyebrow">Promotional access</p><h2>Premium invite codes</h2><p className="muted">Each code grants one workspace 30 days on the selected plan. The code is shown only once.</p></div><TicketCheck size={20} /></div><form className="panel admin-plan-card admin-invite-create" onSubmit={create}><label className="field admin-invite-plan-field"><span>Invite plan</span><select required disabled={availablePlans.length === 0} value={selectedPlan?.key ?? ""} onChange={(event) => setSelectedPlanKey(event.target.value)}>{availablePlans.length === 0 ? <option value="">No active paid plans</option> : availablePlans.map((plan) => <option key={plan.id} value={plan.key}>{plan.name}</option>)}</select></label>{selectedPlan ? <div className="admin-invite-plan-summary"><div><span>Selected access</span><strong>{selectedPlan.name}</strong></div><dl>{limitFields.map(([key, fieldLabel]) => <div key={key}><dt>{fieldLabel}</dt><dd>{selectedPlan[key] === null ? "Unlimited" : selectedPlan[key].toLocaleString("en-IN")}</dd></div>)}</dl></div> : <p className="admin-invite-plan-empty">Create or reactivate a paid plan before generating an invite code.</p>}<div className="admin-invite-inputs"><label className="field"><span>Internal label</span><input required minLength={2} maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="September creator cohort" /></label><label className="field"><span>Code expires <em>optional</em></span><input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label><label className="field"><span>Operator reason</span><input required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="button button-primary" disabled={busy || !selectedPlan} type="submit"><Plus size={16} /> Generate code</button></div>{createdCode ? <div className="admin-created-code"><code>{createdCode}</code><button className="button button-secondary button-small" type="button" onClick={() => void navigator.clipboard.writeText(createdCode)}><Copy size={14} /> Copy</button></div> : null}</form><div className="admin-invite-list">{inviteCodes.map((item) => { const state = item.redemption ? "used" : item.revokedAt ? "revoked" : item.expiresAt && new Date(item.expiresAt) <= new Date() ? "expired" : "ready"; return <article className="admin-invite-row" key={item.id}><div><strong>{item.label}</strong><p>{item.plan.name} · {item.durationDays} days · created {new Date(item.createdAt).toLocaleDateString("en-IN")}</p>{item.redemption ? <small>Redeemed by workspace {item.redemption.workspaceId} · expires {new Date(item.redemption.expiresAt).toLocaleDateString("en-IN")}</small> : null}</div><span className={`status-pill is-${state === "ready" ? "active" : "suspended"}`}>{state}</span>{state === "ready" ? <button className="button button-secondary button-small" type="button" disabled={busy} onClick={() => void revoke(item.id)}><Ban size={14} /> Revoke</button> : null}</article>; })}</div></section>;
}

export function PlansScreen({ plans, inviteCodes = [] }: { plans: Plan[]; inviteCodes?: InviteCode[] }) {
  const router = useRouter(); const [creating, setCreating] = useState(false); const [key, setKey] = useState(""); const [value, setValue] = useState(defaults); const [reason, setReason] = useState(""); const [notice, setNotice] = useState<{ tone: "error" | "success"; message: string } | null>(null);
  function setError(message: string | null) { setNotice(message ? { tone: "error", message } : null); }
  async function create(event: FormEvent) { event.preventDefault(); setCreating(true); setError(null); try { await mutate("/api/admin/plans", "POST", { key, ...value }, reason); setKey(""); setValue(defaults); router.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message.replaceAll("_", " ") : "Operation failed"); } finally { setCreating(false); } }
  return <main className="page-wrap admin-resource-page"><header className="page-header"><div><p className="eyebrow">Linkar operator / entitlements</p><h1>Plans and limits</h1><p className="muted page-lede">Define enforceable templates. Empty limits mean unlimited; retired plans remain attached to existing workspaces.</p></div><span className="admin-count-badge"><WalletCards size={16} /> {plans.length} templates</span></header>{notice ? <ActionNotice tone={notice.tone} message={notice.message} onDismiss={() => setNotice(null)} /> : null}<PremiumInviteManager plans={plans} inviteCodes={inviteCodes} onError={setError} onSuccess={(message) => setNotice({ tone: "success", message })} /><form className="panel admin-plan-card admin-new-plan" onSubmit={create}><div className="panel-heading"><div><p className="eyebrow">New template</p><h2>Create plan</h2></div><Plus size={20} /></div><label className="field"><span>Stable key</span><input required pattern="[a-z][a-z0-9_-]{1,39}" value={key} onChange={(event) => setKey(event.target.value)} placeholder="growth" /></label><PlanFields value={value} onChange={setValue} /><label className="field"><span>Operator reason</span><input required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button className="button button-primary" disabled={creating} type="submit"><Plus size={16} /> Create plan</button></form><section className="admin-plan-stack" aria-label="Plan templates">{plans.map((plan) => <PlanEditor key={plan.id} plan={plan} onError={setError} />)}</section></main>;
}
