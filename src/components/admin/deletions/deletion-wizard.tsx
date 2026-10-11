"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { TriangleAlert } from "lucide-react";

import { RelativeTime } from "@/src/components/ui/relative-time";
import { adminCommand, adminErrorMessage, adminIdempotencyKey, humanizeAdminCode } from "../shared/admin-request";
import { REASON_LABEL } from "../shared/reason-dialog";

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
      setMessage({ tone: "success", text: "Deletion queued. You can follow it in Deletion progress below." });
      router.refresh();
    } catch (cause) {
      setMessage({ tone: "error", text: adminErrorMessage(cause, "Deletion failed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-card is-danger" aria-labelledby="deletion-wizard-title">
      <div className="admin-card-head">
        <div>
          <h2 id="deletion-wizard-title">Delete a workspace or user</h2>
          <p>First preview exactly what will be removed, then type the confirmation phrase to queue it.</p>
        </div>
      </div>
      <div className="admin-form">
        <div className="admin-form-row">
          <label className="field">
            <span>What to delete</span>
            <select value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); resetPreview(); }}>
              <option value="WORKSPACE">Workspace</option>
              <option value="USER">User</option>
            </select>
          </label>
          <label className="field">
            <span>{kind === "WORKSPACE" ? "Workspace ID" : "User ID"}</span>
            <input value={targetId} autoComplete="off" spellCheck={false} aria-describedby="deletion-target-hint" onChange={(event) => { setTargetId(event.target.value); resetPreview(); }} />
          </label>
        </div>
        <p id="deletion-target-hint" className="admin-hint">{kind === "WORKSPACE" ? "Copy it from the ID chip on the workspace page." : "Copy it from the ID chip on the user page."}</p>
        <label className="field">
          <span>{REASON_LABEL}</span>
          <textarea value={reason} maxLength={500} onChange={(event) => { setReason(event.target.value); resetPreview(); }} rows={3} />
        </label>
        <div className="admin-actions">
          <button className="button button-secondary" type="button" disabled={busy || !target.id || reason.trim().length < 3} onClick={() => void preview()}>Preview what will be deleted</button>
          {!target.id || reason.trim().length < 3 ? <span className="admin-hint">Add the {kind === "WORKSPACE" ? "workspace" : "user"} ID and a reason to preview.</span> : null}
        </div>
        {prepared ? (
          <div className="admin-impact">
            <h3>{prepared.impact.identity.label}</h3>
            <dl className="admin-kv">
              {Object.entries(prepared.impact.counts).map(([label, count]) => <div key={label}><dt>{humanizeAdminCode(label.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase())}</dt><dd>{count.toLocaleString("en-IN")}</dd></div>)}
            </dl>
            <p className="admin-hint">These counts are a snapshot. New activity does not cancel this preview; a change in members or protection does.</p>
            {prepared.impact.warnings.map((warning) => <p className="admin-callout is-danger" key={warning}><TriangleAlert size={16} aria-hidden /><span>{warning}</span></p>)}
            {kind === "WORKSPACE" ? (
              <label className="admin-check">
                <input type="checkbox" checked={includeAuthUsers} onChange={(event) => setIncludeAuthUsers(event.target.checked)} /> Also delete sign-in accounts left with no workspace
              </label>
            ) : null}
            <label className="field">
              <span>Type exactly <code className="admin-phrase">{prepared.confirmationPhrase}</code></span>
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
            </label>
            <p className="admin-hint">This preview expires <RelativeTime inline value={prepared.challenge.expiresAt} />.</p>
            <div className="admin-actions">
              <button className="button button-danger" type="button" disabled={busy || confirmation !== prepared.confirmationPhrase} onClick={() => void submit()}>Delete permanently</button>
            </div>
          </div>
        ) : null}
        {message ? <p role={message.tone === "error" ? "alert" : "status"} className={`admin-message ${message.tone === "error" ? "form-error" : "form-success"}`}>{message.text}</p> : null}
      </div>
    </section>
  );
}
