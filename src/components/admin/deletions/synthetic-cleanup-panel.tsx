"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { RelativeTime } from "@/src/components/ui/relative-time";
import { adminCommand, adminErrorMessage, adminIdempotencyKey } from "../shared/admin-request";
import { REASON_LABEL } from "../shared/reason-dialog";

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
      setMessage({ tone: "success", text: "Cleanup queued. You can follow it in Deletion progress." });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: adminErrorMessage(error, "Cleanup request failed") });
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-card" aria-labelledby="synthetic-cleanup-title">
    <div className="admin-card-head">
      <div>
        <h2 id="synthetic-cleanup-title">Clean up test accounts</h2>
        <p>Removes only accounts made by Linkar&apos;s own tests: owner-, member-, signout-, release-verify and probe-deploy addresses followed by numbers at example.com, plus the internal preview account. Every other email is kept.</p>
      </div>
    </div>
    <div className="admin-form">
      <label className="field">
        <span>{REASON_LABEL}</span>
        <textarea value={reason} maxLength={500} onChange={(event) => { setReason(event.target.value); setPreview(null); setSubmissionKey(null); }} rows={3} />
      </label>
      <div className="admin-actions">
        <button className="button button-secondary" type="button" disabled={busy || reason.trim().length < 3} onClick={() => void loadPreview()}>Preview test accounts</button>
        {reason.trim().length < 3 ? <span className="admin-hint">Add a reason to preview.</span> : null}
      </div>
      {preview ? <div className="admin-impact">
        <h3>{preview.count === 1 ? "1 account matches" : `${preview.count} accounts match`}</h3>
        <dl className="admin-kv">
          <div><dt>Accounts</dt><dd>{preview.count}</dd></div>
          <div><dt>Workspace memberships</dt><dd>{preview.membershipsAffected}</dd></div>
          <div><dt>Workspaces they own</dt><dd>{preview.ownedWorkspacesAffected}</dd></div>
          <div><dt>Protected owners skipped</dt><dd>{preview.protectedAccountsExcluded}</dd></div>
        </dl>
        <p className="admin-hint">Workspaces they own are removed first. Each account is checked again just before it is deleted.</p>
        <label className="field">
          <span>Type exactly <code className="admin-phrase">{preview.confirmationPhrase}</code></span>
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
        </label>
        <p className="admin-hint">This preview expires <RelativeTime inline value={preview.challenge.expiresAt} />.</p>
        <div className="admin-actions">
          <button className="button button-danger" type="button" disabled={busy || !submissionKey || confirmation !== preview.confirmationPhrase || preview.count === 0} onClick={() => void queueCleanup()}>Queue permanent cleanup</button>
        </div>
      </div> : null}
      {message ? <p role={message.tone === "error" ? "alert" : "status"} className={`admin-message ${message.tone === "error" ? "form-error" : "form-success"}`}>{message.text}</p> : null}
    </div>
  </section>;
}
