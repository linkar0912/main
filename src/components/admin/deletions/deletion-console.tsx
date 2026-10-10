"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { formatAdminDateTime } from "@/src/components/admin/shared/date-format";
import { AdminPagination } from "../shared/admin-pagination";
import { adminCommand, adminErrorMessage, adminIdempotencyKey } from "../shared/admin-request";
import { StatusPill } from "../shared/status-pill";
import { DeletionWizard } from "./deletion-wizard";
import { SyntheticCleanupPanel } from "./synthetic-cleanup-panel";

type Job = {
  id: string;
  targetKind: string;
  targetId: string;
  state: string;
  currentStage: string | null;
  progress: number;
  irreversibleAt: Date | string | null;
  terminalErrorCode: string | null;
  createdAt: Date | string;
};

// Cancellation is only possible before the irreversible boundary is crossed.
// A job already cancelling can be cancelled again to re-enqueue a stalled request.
const cancellableStates = ["QUEUED", "RUNNING", "FAILED", "CANCELLING"];
const activeStates = ["QUEUED", "RUNNING", "CANCELLING"];
const REFRESH_INTERVAL_MS = 20_000;

function jobLabel(job: Job): string {
  return `${job.targetKind.toLowerCase().replaceAll("_", " ")} ${job.targetId}`;
}

export function DeletionConsole({
  jobs,
  cursor = null,
  history = [],
  nextCursor = null,
}: {
  jobs: Job[];
  cursor?: string | null;
  history?: string[];
  nextCursor?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reasonReady = reason.trim().length >= 3;
  const hasActiveJob = jobs.some((job) => activeStates.includes(job.state));

  // Progress is written by the worker, so poll only while a job can still move.
  useEffect(() => {
    if (!hasActiveJob) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && busy === null) router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [busy, hasActiveJob, router]);

  async function command(job: Job, action: "cancel" | "retry") {
    setBusy(job.id);
    setError(null);
    setNotice(null);
    try {
      await adminCommand(`/api/admin/deletions/${job.id}`, { method: "PATCH", body: { action }, reason, fallback: "deletion_command_failed", idempotencyKey: adminIdempotencyKey("deletion") });
      setNotice(action === "cancel" ? "Cancellation requested." : "Deletion job queued again.");
      router.refresh();
    } catch (cause) {
      setError(adminErrorMessage(cause, "Command failed. Check your connection and try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page-wrap admin-resource-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Linkar operator / data lifecycle</p>
          <h1>Permanent deletion</h1>
          <p className="muted page-lede">Impact-reviewed, resumable deletion with a hard irreversible boundary.</p>
        </div>
      </header>

      <SyntheticCleanupPanel />
      <DeletionWizard />

      <section className="panel admin-table-panel" aria-labelledby="deletion-progress-title">
        <div className="panel-heading">
          <div><p className="eyebrow">Durable jobs</p><h2 id="deletion-progress-title">Deletion progress</h2></div>
        </div>
        {jobs.length === 0 ? (
          <div className="empty-state">
            <h3>No deletion jobs</h3>
            <p>Queued, running, and finished deletions will be listed here.</p>
          </div>
        ) : (
          <>
            <label className="field admin-job-reason">
              <span>Reason for cancel or retry</span>
              <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Required before a job can be cancelled or retried" />
            </label>
            {error ? <div className="form-error" role="alert">{error}</div> : null}
            {notice ? <div className="form-success" role="status">{notice}</div> : null}
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr><th>Target</th><th>State</th><th>Stage</th><th>Progress</th><th>Created</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const canCancel = cancellableStates.includes(job.state) && !job.irreversibleAt;
                    const canRetry = job.state === "FAILED";
                    return (
                      <tr key={job.id}>
                        <td><strong>{job.targetKind.toLowerCase()}</strong><small>{job.targetId}</small></td>
                        <td><StatusPill status={job.state} />{job.terminalErrorCode ? <small>{job.terminalErrorCode}</small> : null}</td>
                        <td>{job.currentStage ? job.currentStage.toLowerCase().replaceAll("_", " ") : "Queued"}</td>
                        <td>{job.progress}%</td>
                        <td>{formatAdminDateTime(job.createdAt)}</td>
                        <td>
                          {canCancel || canRetry ? (
                            <span className="admin-job-actions">
                              {canCancel ? <button className="button button-small button-secondary" type="button" disabled={busy !== null || !reasonReady} aria-label={`Cancel deletion of ${jobLabel(job)}`} onClick={() => void command(job, "cancel")}>Cancel</button> : null}
                              {canRetry ? <button className="button button-small button-secondary" type="button" disabled={busy !== null || !reasonReady} aria-label={`Retry deletion of ${jobLabel(job)}`} onClick={() => void command(job, "retry")}>Retry</button> : null}
                            </span>
                          ) : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <AdminPagination
        basePath="/admin/deletions"
        params={{}}
        cursor={cursor}
        history={history}
        nextCursor={nextCursor}
        label="Deletion job pagination"
        summary={hasActiveJob ? "Refreshes every 20 seconds while a job is active." : "Newest jobs first."}
      />
    </main>
  );
}
