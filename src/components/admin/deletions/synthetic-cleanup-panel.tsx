"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CleanupPreview = {
  count: number;
  membershipsAffected: number;
  ownedWorkspacesAffected: number;
  protectedAccountsExcluded: number;
  digest: string;
  confirmationPhrase: string;
  challenge: { token: string; expiresAt: string };
};

function readableError(error: unknown): string {
  return error instanceof Error ? error.message.replaceAll("_", " ") : "Cleanup request failed";
}

export function SyntheticCleanupPanel() {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [submissionKey, setSubmissionKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function request(path: string, body: unknown, idempotencyKey = `synthetic-cleanup-${crypto.randomUUID()}`) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-reason": reason,
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json() as { data?: CleanupPreview; error?: string };
    if (!response.ok) throw new Error(result.error ?? "synthetic_cleanup_failed");
    return result;
  }

  async function loadPreview() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await request("/api/admin/deletions/synthetic/preview", {});
      setPreview(result.data ?? null);
      setSubmissionKey(`synthetic-cleanup-${crypto.randomUUID()}`);
      setConfirmation("");
    } catch (error) {
      setPreview(null);
      setSubmissionKey(null);
      setMessage(readableError(error));
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
      setMessage("Permanent cleanup queued. Progress is shown below.");
      router.refresh();
    } catch (error) {
      setMessage(readableError(error));
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
    <label>Operator reason<textarea value={reason} onChange={(event) => { setReason(event.target.value); setPreview(null); setSubmissionKey(null); }} rows={3} /></label>
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
      <label>Type exactly <code>{preview.confirmationPhrase}</code><input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
      <p className="muted">This single-use challenge expires {new Date(preview.challenge.expiresAt).toLocaleString()}.</p>
      <button className="button button-danger" type="button" disabled={busy || !submissionKey || confirmation !== preview.confirmationPhrase || preview.count === 0} onClick={() => void queueCleanup()}>Queue permanent cleanup</button>
    </div> : null}
    {message ? <p role="status" className="admin-command-message">{message}</p> : null}
  </section>;
}
