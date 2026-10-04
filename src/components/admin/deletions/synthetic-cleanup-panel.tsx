"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { formatAdminDateTime } from "@/src/components/admin/shared/date-format";
import { adminCommand, adminErrorMessage, adminIdempotencyKey } from "../shared/admin-request";

type CleanupPreview = {
  count: number;
  membershipsAffected: number;
  ownedWorkspacesAffected: number;
  protectedAccountsExcluded: number;
  digest: string;
  confirmationPhrase: string;
  challenge: { token: string; expiresAt: string };
};

type Message = { tone: "error" | "success"; text: string };

export function SyntheticCleanupPanel() {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [submissionKey, setSubmissionKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  function request(path: string, body: unknown, idempotencyKey = adminIdempotencyKey("synthetic-cleanup")) {
    return adminCommand<CleanupPreview>(path, { body, reason, fallback: "synthetic_cleanup_failed", idempotencyKey });
  }

  async function loadPreview() {
    setBusy(true);
    setMessage(null);
    try {
      setPreview(await request("/api/admin/deletions/synthetic/preview", {}) ?? null);
      // One key for the whole submission, so a retried click replays instead of queueing twice.
      setSubmissionKey(adminIdempotencyKey("synthetic-cleanup"));
      setConfirmation("");
    } catch (error) {
      setPreview(null);
      setSubmissionKey(null);
      setMessage({ tone: "error", text: adminErrorMessage(error, "Cleanup request failed") });
    } finally {
      setBusy(false);
    }
  }

  async function queueCleanup() {
    if (!preview || !submissionKey) return;
    setBusy(true);
    setMessage(null);
    try {
      await request("/api/admin/deletions/synthetic", {
        impactDigest: preview.digest,
        confirmation,
        challengeToken: preview.challenge.token,
      }, submissionKey);
      setPreview(null);
      setSubmissionKey(null);
      setConfirmation("");
      setMessage({ tone: "success", text: "Permanent cleanup queued. Progress is shown below." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: adminErrorMessage(error, "Cleanup request failed") });
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel admin-deletion-wizard synthetic-cleanup-panel" aria-labelledby="synthetic-cleanup-title">
    <div>
      <p className="eyebrow">Generated test data</p>
      <h2 id="synthetic-cleanup-title">Clean up synthetic accounts</h2>
      <p className="muted">Matches only owner-[numbers], member-[numbers], and signout-[numbers] at example.com. Every other email is preserved.</p>
    </div>
    <label className="field">
      <span>Operator reason</span>
      <textarea value={reason} maxLength={500} onChange={(event) => { setReason(event.target.value); setPreview(null); setSubmissionKey(null); }} rows={3} />
    </label>
    <button className="button button-secondary" type="button" disabled={busy || reason.trim().length < 3} onClick={() => void loadPreview()}>Preview test accounts</button>
    {preview ? <div className="admin-impact-preview">
      <div><p className="eyebrow">Current production impact</p><h3>{preview.count} accounts match</h3></div>
      <dl className="admin-system-metrics">
        <div><dt>Accounts</dt><dd>{preview.count}</dd></div>
        <div><dt>Memberships</dt><dd>{preview.membershipsAffected}</dd></div>
        <div><dt>Owned workspaces</dt><dd>{preview.ownedWorkspacesAffected}</dd></div>
        <div><dt>Protected owners excluded</dt><dd>{preview.protectedAccountsExcluded}</dd></div>
      </dl>
      <p className="form-warning">Owned workspaces are removed first. Account identities are rechecked again immediately before permanent deletion.</p>
      <label className="field">
        <span>Type exactly <code>{preview.confirmationPhrase}</code></span>
        <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
      </label>
      <p className="muted">This single-use challenge expires {formatAdminDateTime(preview.challenge.expiresAt)}.</p>
      <button className="button button-danger" type="button" disabled={busy || !submissionKey || confirmation !== preview.confirmationPhrase || preview.count === 0} onClick={() => void queueCleanup()}>Queue permanent cleanup</button>
    </div> : null}
    {message ? <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "form-error" : "form-success"}>{message.text}</p> : null}
  </section>;
}
