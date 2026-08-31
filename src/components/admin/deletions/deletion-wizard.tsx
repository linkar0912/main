"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Prepared = { impact: { identity: { label: string }; counts: Record<string, number>; warnings: string[] }; impactDigest: string; confirmationPhrase: string; challenge: { token: string; expiresAt: string } };

export function DeletionWizard() {
  const router = useRouter();
  const [kind, setKind] = useState<"USER" | "WORKSPACE">("WORKSPACE");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [includeAuthUsers, setIncludeAuthUsers] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function call(path: string, body: unknown) {
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-admin-reason": reason, "idempotency-key": `deletion-${crypto.randomUUID()}` }, body: JSON.stringify(body) });
    const result = await response.json() as { data?: Prepared; error?: string };
    if (!response.ok) throw new Error(result.error ?? "deletion_request_failed");
    return result;
  }

  async function preview() {
    setBusy(true); setMessage(null);
    try { const result = await call("/api/admin/deletions/preview", { target: { kind, id: targetId } }); setPrepared(result.data ?? null); setConfirmation(""); }
    catch (error) { setPrepared(null); setMessage(error instanceof Error ? error.message.replaceAll("_", " ") : "Preview failed"); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!prepared) return;
    setBusy(true); setMessage(null);
    try {
      await call("/api/admin/deletions", { target: { kind, id: targetId }, impactDigest: prepared.impactDigest, confirmation, challengeToken: prepared.challenge.token, includeAuthUsers });
      setPrepared(null); setTargetId(""); setConfirmation(""); setMessage("Permanent deletion queued."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message.replaceAll("_", " ") : "Deletion failed"); }
    finally { setBusy(false); }
  }

  return <section className="panel admin-deletion-wizard" aria-labelledby="deletion-wizard-title">
    <p className="eyebrow">Challenge protected</p><h2 id="deletion-wizard-title">Request permanent deletion</h2>
    <div className="form-grid two-col"><label>Target type<select value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setPrepared(null); }}><option value="WORKSPACE">Workspace</option><option value="USER">User</option></select></label><label>Target UUID<input value={targetId} onChange={(event) => { setTargetId(event.target.value); setPrepared(null); }} /></label></div>
    <label>Operator reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /></label>
    <button className="button button-secondary" type="button" disabled={busy || targetId.length < 1 || reason.trim().length < 3} onClick={preview}>Preview irreversible impact</button>
    {prepared ? <div className="admin-impact-preview"><h3>{prepared.impact.identity.label}</h3><dl className="admin-system-metrics">{Object.entries(prepared.impact.counts).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>{prepared.impact.warnings.map((warning) => <p className="form-warning" key={warning}>{warning}</p>)}{kind === "WORKSPACE" ? <label className="checkbox-row"><input type="checkbox" checked={includeAuthUsers} onChange={(event) => setIncludeAuthUsers(event.target.checked)} /> Also delete orphaned Auth users after workspace cleanup</label> : null}<label>Type exactly <code>{prepared.confirmationPhrase}</code><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label><p className="muted">Challenge expires {new Date(prepared.challenge.expiresAt).toLocaleString()}.</p><button className="button button-danger" type="button" disabled={busy || confirmation !== prepared.confirmationPhrase} onClick={submit}>Queue permanent deletion</button></div> : null}
    {message ? <p role="status" className="admin-command-message">{message}</p> : null}
  </section>;
}
