"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/src/components/page-header";
import { IdChip } from "@/src/components/ui/id-chip";
import { RelativeTime } from "@/src/components/ui/relative-time";
import { AdminPagination } from "../shared/admin-pagination";
import { adminCommand, adminErrorMessage, adminIdempotencyKey, humanizeAdminCode } from "../shared/admin-request";
import { ReasonDialog } from "../shared/reason-dialog";
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

function targetName(job: Job): string {
  return job.targetKind === "WORKSPACE" ? "Workspace" : job.targetKind === "USER" ? "User" : humanizeAdminCode(job.targetKind.toLowerCase());
}

type Pending = { job: Job; action: "cancel" | "retry" };

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
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hasActiveJob = jobs.some((job) => activeStates.includes(job.state));

  // Progress is written by the worker, so poll only while a job can still move.
  useEffect(() => {
    if (!hasActiveJob) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && busy === null && pending === null) router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [busy, hasActiveJob, pending, router]);

  function open(job: Job, action: "cancel" | "retry") {
    setError(null);
    setNotice(null);
    setPending({ job, action });
  }

  async function command(reason: string) {
    if (!pending) return;
    const { job, action } = pending;
    setBusy(job.id);
    setError(null);
    try {
      await adminCommand(`/api/admin/deletions/${job.id}`, { method: "PATCH", body: { action }, reason, fallback: "deletion_command_failed", idempotencyKey: adminIdempotencyKey("deletion") });
      setNotice(action === "cancel" ? "Cancellation requested." : "Deletion queued again.");
      setPending(null);
      router.refresh();
    } catch (cause) {
      setError(adminErrorMessage(cause, "Command failed. Check your connection and try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page-wrap admin-page">
      <PageHeader
        title="Delete data"
        description="Permanently remove a workspace or user. This can't be undone."
        actions={<Link className="button button-secondary" href="/admin/system/data-deletions">Meta deletion requests</Link>}
      />

      <DeletionWizard />

      <section className="admin-card is-flush" aria-labelledby="deletion-progress-title">
        <div className="admin-card-head">
          <div>
            <h2 id="deletion-progress-title">Deletion progress</h2>
            <p>{hasActiveJob ? "Refreshes every 20 seconds while a deletion is running." : "Newest first."}</p>
          </div>
        </div>
        {jobs.length === 0 ? (
          <div className="admin-empty">
            <p>No deletions yet. Queued, running and finished deletions appear here.</p>
          </div>
        ) : (
          <>
            {notice ? <div className="admin-card-body"><div className="form-success admin-message" role="status">{notice}</div></div> : null}
            <div className="table-scroll">
              <table className="data-table is-stackable">
                <thead>
                  <tr><th>Deleting</th><th>Status</th><th>Progress</th><th>Started</th><th className="is-action"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const canCancel = cancellableStates.includes(job.state) && !job.irreversibleAt;
                    const canRetry = job.state === "FAILED";
                    return (
                      <tr key={job.id}>
                        <td><span className="cell-stack"><strong>{targetName(job)}</strong><IdChip id={job.targetId} /></span></td>
                        <td data-label="Status">
                          <span className="cell-stack">
                            <StatusPill status={job.state} />
                            {job.terminalErrorCode ? <span className="cell-meta">{humanizeAdminCode(job.terminalErrorCode)}</span> : null}
                          </span>
                        </td>
                        <td data-label="Progress">
                          <span className="cell-stack">
                            <span>{job.progress}%</span>
                            <span className="cell-meta">{job.currentStage ? humanizeAdminCode(job.currentStage.toLowerCase()) : job.state === "COMPLETED" ? "Finished" : "Waiting to start"}</span>
                          </span>
                        </td>
                        <td data-label="Started"><RelativeTime value={job.createdAt instanceof Date ? job.createdAt.toISOString() : job.createdAt} /></td>
                        <td className="is-action">
                          {canCancel || canRetry ? (
                            <span className="admin-actions">
                              {canCancel ? <button className="button button-small button-secondary" type="button" disabled={busy !== null} aria-label={`Cancel deletion of ${jobLabel(job)}`} onClick={() => open(job, "cancel")}>Cancel</button> : null}
                              {canRetry ? <button className="button button-small button-secondary" type="button" disabled={busy !== null} aria-label={`Retry deletion of ${jobLabel(job)}`} onClick={() => open(job, "retry")}>Retry</button> : null}
                            </span>
                          ) : <span className="admin-hint">{job.irreversibleAt && cancellableStates.includes(job.state) ? "Can no longer be stopped" : "No actions"}</span>}
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
        summary={null}
      />

      <SyntheticCleanupPanel />

      {pending ? (
        <ReasonDialog
          title={`${pending.action === "cancel" ? "Cancel" : "Retry"} deleting this ${targetName(pending.job).toLowerCase()}`}
          intro={pending.action === "cancel"
            ? "Stops the deletion before anything else is removed. Data already removed stays removed."
            : "Queues the deletion again from the step that failed."}
          busy={busy !== null}
          error={error}
          danger={pending.action === "retry"}
          confirmLabel={pending.action === "cancel" ? "Cancel deletion" : "Retry deletion"}
          cancelLabel={pending.action === "cancel" ? "Keep deleting" : "Cancel"}
          onCancel={() => { setPending(null); setError(null); }}
          onConfirm={(reason) => void command(reason)}
        />
      ) : null}
    </main>
  );
}
