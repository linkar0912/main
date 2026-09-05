"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DeletionWizard } from "./deletion-wizard";
import { SyntheticCleanupPanel } from "./synthetic-cleanup-panel";

type Job = { id: string; targetKind: string; targetId: string; state: string; currentStage: string | null; progress: number; irreversibleAt: Date | string | null; terminalErrorCode: string | null; createdAt: Date | string };

export function DeletionConsole({ jobs }: { jobs: Job[] }) {
  const router = useRouter(); const [busy, setBusy] = useState<string | null>(null); const [reason, setReason] = useState("");
  async function command(id: string, action: "cancel" | "retry") { setBusy(id); try { const response = await fetch(`/api/admin/deletions/${id}`, { method: "PATCH", headers: { "content-type": "application/json", "x-admin-reason": reason, "idempotency-key": `deletion-${crypto.randomUUID()}` }, body: JSON.stringify({ action }) }); if (!response.ok) throw new Error((await response.json() as { error?: string }).error); router.refresh(); } finally { setBusy(null); } }
  return <main className="page-wrap admin-resource-page"><header className="page-header"><div><p className="eyebrow">Linkar operator / data lifecycle</p><h1>Permanent deletion</h1><p className="muted page-lede">Impact-reviewed, resumable deletion with a hard irreversible boundary.</p></div></header><SyntheticCleanupPanel /><DeletionWizard /><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Durable jobs</p><h2>Deletion progress</h2></div></div><label>Reason for cancel or retry<input value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="table-scroll"><table className="data-table"><thead><tr><th>Target</th><th>State</th><th>Stage</th><th>Progress</th><th>Created</th><th>Action</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><strong>{job.targetKind}</strong><small>{job.targetId}</small></td><td>{job.state}{job.terminalErrorCode ? <small>{job.terminalErrorCode}</small> : null}</td><td>{job.currentStage ?? "Queued"}</td><td>{job.progress}%</td><td>{new Date(job.createdAt).toLocaleString()}</td><td>{["QUEUED", "RUNNING", "CANCELLING"].includes(job.state) && !job.irreversibleAt ? <button className="button button-small button-secondary" disabled={busy === job.id || reason.trim().length < 3} onClick={() => void command(job.id, "cancel")}>Cancel</button> : job.state === "FAILED" ? <button className="button button-small button-secondary" disabled={busy === job.id || reason.trim().length < 3} onClick={() => void command(job.id, "retry")}>Retry</button> : "—"}</td></tr>)}{jobs.length === 0 ? <tr><td colSpan={6}>No deletion jobs.</td></tr> : null}</tbody></table></div></section></main>;
}
