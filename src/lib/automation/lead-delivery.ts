import type { OutboundEmail } from "../mailer";
import { sendEmail } from "../mailer";
import { MetaApiError } from "../meta/client";
import type { LeadDeliveryJob } from "../queue";
import type { AutomationRepository } from "../repository";
import { resolveSafeOutboundTarget, type OutboundLookup } from "../security/outbound-url";
import { executeOutboundDelivery, type DeliveryExecutionResult } from "./outbound-delivery";

type LeadEmailPayload = OutboundEmail;
type LeadWebhookPayload = { url: string; body: Record<string, unknown> };

export type LeadDeliveryOptions = {
  fetcher?: typeof fetch;
  lookup?: OutboundLookup;
  mailer?: typeof sendEmail;
  timeoutMs?: number;
  claimLeaseMs?: number;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function postWebhook(payload: LeadWebhookPayload, options: LeadDeliveryOptions): Promise<{ id?: string }> {
  const fetcher = options.fetcher ?? fetch;
  let target = payload.url;
  let redirects = 0;

  for (;;) {
    let safeTarget: URL;
    try {
      safeTarget = await resolveSafeOutboundTarget(target, { lookup: options.lookup });
    } catch (error) {
      throw new MetaApiError(error instanceof Error ? error.message : String(error), 400, true);
    }

    let response: Response;
    try {
      response = await fetcher(safeTarget, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload.body),
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
      });
    } catch (error) {
      throw new MetaApiError(error instanceof Error ? error.message : String(error), 0, false);
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new MetaApiError("Lead webhook redirect omitted Location", 400, true);
      if (redirects >= 3) throw new MetaApiError("Lead webhook exceeded three redirects", 400, true);
      target = new URL(location, safeTarget).href;
      redirects += 1;
      continue;
    }
    if (!response.ok) {
      throw new MetaApiError(`Lead webhook returned HTTP ${response.status}`, response.status, true);
    }
    return {};
  }
}

function assertDelivery(job: LeadDeliveryJob, record: Awaited<ReturnType<AutomationRepository["getOutboundDelivery"]>>) {
  if (!record || record.workspaceId !== job.workspaceId || record.kind !== job.kind) {
    throw new Error("Lead delivery does not exist or does not belong to this workspace");
  }
  return record;
}

export async function processLeadDelivery(
  job: LeadDeliveryJob,
  repository: AutomationRepository,
  options: LeadDeliveryOptions = {},
): Promise<DeliveryExecutionResult> {
  const record = assertDelivery(job, await repository.getOutboundDelivery(job.deliveryKey));
  if (await repository.getWorkspaceStatus(job.workspaceId) !== "ACTIVE") {
    const owner = `lead_guard:${job.deliveryKey}`;
    const claim = await repository.claimOutboundDelivery(
      job.deliveryKey,
      owner,
      new Date(Date.now() + 30_000).toISOString(),
    );
    if (claim.claimed) {
      await repository.failOutboundDelivery(job.deliveryKey, owner, "Workspace is not active", false, "SUPPRESSED");
    }
    return { status: "FAILED", retryable: false, error: "Workspace is not active" };
  }
  if (job.kind === "LEAD_EMAIL") {
    return executeOutboundDelivery({
      deliveryKey: record.deliveryKey,
      workspaceId: record.workspaceId,
      automationId: record.automationId,
      recipientId: record.recipientId,
      kind: record.kind,
      payload: record.payload as LeadEmailPayload,
      claimLeaseMs: options.claimLeaseMs ?? 30_000,
      repository,
    }, async (payload) => {
      await (options.mailer ?? sendEmail)(payload);
      return {};
    });
  }
  return executeOutboundDelivery({
    deliveryKey: record.deliveryKey,
    workspaceId: record.workspaceId,
    automationId: record.automationId,
    recipientId: record.recipientId,
    kind: record.kind,
    payload: record.payload as LeadWebhookPayload,
    claimLeaseMs: options.claimLeaseMs ?? 30_000,
    repository,
  }, (payload) => postWebhook(payload, options));
}
