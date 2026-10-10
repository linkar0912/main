import "server-only";
import { ADMIN_QUEUE_NAMES, enqueueAdminMaintenance, listAdminFailedJobs, retryAdminQueueJobs, setAdminQueuePaused } from "@/src/lib/queue";
import { AdminWorkspaceError } from "../workspace-service";
function translate(error: unknown): never { const message = error instanceof Error ? error.message : ""; const code = ["unknown_queue", "queue_unavailable", "invalid_job_batch", "job_not_found", "job_not_failed"].includes(message) ? message : "queue_command_failed"; const status = code === "unknown_queue" ? 404 : code === "queue_unavailable" ? 503 : 409; throw new AdminWorkspaceError(status, code); }
function assertQueue(name: string): void { if (!ADMIN_QUEUE_NAMES.includes(name as never)) throw new AdminWorkspaceError(404, "unknown_queue"); }
// `return await` keeps rejections inside the try so translate() maps them to safe codes.
export async function executeQueueCommand(name: string, input: { action: "pause" | "resume" | "retry_failed_jobs"; jobIds?: string[] }) { assertQueue(name); try { if (input.action === "retry_failed_jobs") return await retryAdminQueueJobs(name, input.jobIds ?? []); return await setAdminQueuePaused(name, input.action === "pause"); } catch (error) { return translate(error); } }
export async function listQueueFailedJobs(name: string) { assertQueue(name); try { return await listAdminFailedJobs(name); } catch (error) { return translate(error); } }
export async function executeSystemCommand(action: "run_delivery_reconciliation" | "run_usage_reconciliation") { const queued = await enqueueAdminMaintenance(action === "run_delivery_reconciliation" ? "delivery_reconciliation" : "usage_reconciliation"); if (!queued) throw new AdminWorkspaceError(503, "maintenance_queue_unavailable"); return { action, queued: true }; }
