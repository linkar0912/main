"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { formatAdminDateTime } from "@/src/components/admin/shared/date-format";
import { adminCommand, adminErrorMessage, adminIdempotencyKey } from "../shared/admin-request";

type Prepared = {
  impact: { identity: { label: string }; counts: Record<string, number>; warnings: string[] };
  impactDigest: string;
  confirmationPhrase: string;
  challenge: { token: string; expiresAt: string };
};
type Message = { tone: "error" | "success"; text: string };

export function DeletionWizard() {
  const router = useRouter();
  const [kind, setKind] = useState<"USER" | "WORKSPACE">("WORKSPACE");
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [includeAuthUsers, setIncludeAuthUsers] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const target = { kind, id: targetId.trim() };

  function call(path: string, body: unknown) {
    return adminCommand<Prepared>(path, { body, reason, fallback: "deletion_request_failed", idempotencyKey: adminIdempotencyKey("deletion") });
  }

  // The preview is bound to one target and reason; editing either invalidates its challenge.
  function resetPreview() {
    setPrepared(null);
    setConfirmation("");
    setIncludeAuthUsers(false);
  }

  async function preview() {
    setBusy(true);
    setMessage(null);
    try {
      setPrepared(await call("/api/admin/deletions/preview", { target }) ?? null);
      setConfirmation("");
    } catch (cause) {
      setPrepared(null);
      setMessage({ tone: "error", text: adminErrorMessage(cause, "Preview failed") });
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!prepared) return;
    setBusy(true);
    setMessage(null);
    try {
      await call("/api/admin/deletions", { target, impactDigest: prepared.impactDigest, confirmation, challengeToken: prepared.challenge.token, includeAuthUsers });
      resetPreview();
      setTargetId("");
      setMessage({ tone: "success", text: "Permanent deletion queued. Progress is shown below." });
      router.refresh();
    } catch (cause) {
      setMessage({ tone: "error", text: adminErrorMessage(cause, "Deletion failed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel admin-deletion-wizard" aria-labelledby="deletion-wizard-title">
      <div>
        <p className="eyebrow">Challenge protected</p>
        <h2 id="deletion-wizard-title">Request permanent deletion</h2>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Target type</span>
          <select value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); resetPreview(); }}>
            <option value="WORKSPACE">Workspace</option>
            <option value="USER">User</option>
          </select>
        </label>
        <label className="field">
          <span>Target ID</span>
          <input value={targetId} autoComplete="off" spellCheck={false} aria-describedby="deletion-target-hint" onChange={(event) => { setTargetId(event.target.value); resetPreview(); }} />
          <small id="deletion-target-hint" className="admin-field-hint">{kind === "WORKSPACE" ? "Workspace IDs look like workspace_… (copy it from the workspace page)." : "User IDs are Supabase Auth UUIDs (copy it from the user page)."}</small>
        </label>
      </div>
      <label className="field">
        <span>Operator reason</span>
        <textarea value={reason} maxLength={500} onChange={(event) => { setReason(event.target.value); resetPreview(); }} rows={3} />
      </label>
      <button className="button button-secondary" type="button" disabled={busy || !target.id || reason.trim().length < 3} onClick={() => void preview()}>Preview irreversible impact</button>
      {prepared ? (
        <div className="admin-impact-preview">
          <h3>{prepared.impact.identity.label}</h3>
          <dl className="admin-system-metrics">
            {Object.entries(prepared.impact.counts).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
          </dl>
          <p className="muted">Counts are a snapshot for review. New activity does not invalidate this preview; a change in members or protection does.</p>
          {prepared.impact.warnings.map((warning) => <p className="form-warning" key={warning}>{warning}</p>)}
          {kind === "WORKSPACE" ? (
            <label className="admin-check-field">
              <input type="checkbox" checked={includeAuthUsers} onChange={(event) => setIncludeAuthUsers(event.target.checked)} /> Also delete orphaned Auth users after workspace cleanup
            </label>
          ) : null}
          <label className="field">
            <span>Type exactly <code>{prepared.confirmationPhrase}</code></span>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
          </label>
          <p className="muted">Challenge expires {formatAdminDateTime(prepared.challenge.expiresAt)}.</p>
          <button className="button button-danger" type="button" disabled={busy || confirmation !== prepared.confirmationPhrase} onClick={() => void submit()}>Queue permanent deletion</button>
        </div>
      ) : null}
      {message ? <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "form-error" : "form-success"}>{message.text}</p> : null}
    </section>
  );
}
