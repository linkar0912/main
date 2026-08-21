import { evaluateFlow } from "./engine";
import type { ExecutionAction, NormalizedEvent } from "./types";
import { unsealSecret } from "../security/secrets";
import type { AutomationRepository, InstagramConnectionRecord } from "../repository";
import { MetaApiError } from "../meta/client";
import type { MetaConnection, MetaMessage } from "../meta/types";
import {
  processCampaignEvent,
  processExistingCampaignParticipant,
  processPendingCampaignInteraction,
  type CampaignRunnerClient,
  type CampaignRunnerOptions,
  type CampaignRunnerResult,
} from "./campaign-runner";

export type AutomationRunnerClient = CampaignRunnerClient;

export type RunnerOptions = CampaignRunnerOptions & {
  campaignsEnabled?: boolean;
};

export type RunnerResult = {
  matched: number;
  sent: number;
  skipped: number;
  failed: number;
};

function metaConnection(connection: InstagramConnectionRecord, tokenEncryptionKey: string): MetaConnection {
  return {
    igUserId: connection.igUserId,
    accessToken: unsealSecret(connection.accessTokenEncrypted, tokenEncryptionKey),
  };
}

async function sendAction(
  client: AutomationRunnerClient,
  connection: MetaConnection,
  action: ExecutionAction,
): Promise<string | undefined> {
  if (action.type === "private_reply") {
    return (await client.sendPrivateReply(connection, action.commentId, action.text)).message_id;
  }

  const message: MetaMessage =
    action.type === "send_text"
      ? { type: "text", text: action.text }
      : action.type === "send_link"
        ? { type: "link", text: action.text, url: action.url }
        : { type: "button", text: action.text, buttonLabel: action.buttonLabel, url: action.url };

  return (await client.sendDirectMessage(connection, action.recipientId, message)).message_id;
}

export async function processNormalizedEvent(
  event: NormalizedEvent,
  repository: AutomationRepository,
  options: RunnerOptions = {},
): Promise<RunnerResult | CampaignRunnerResult> {
  const mapping = await repository.findWorkspaceByInstagramAccount(event.accountId);
  if (!mapping) return { matched: 0, sent: 0, skipped: 0, failed: 0 };

  const automations = (await repository.listAutomations(mapping.workspaceId)).filter(
    (automation) => automation.status === "ACTIVE",
  );

  if (options.campaignsEnabled === true) {
    const interaction = await processPendingCampaignInteraction(
      event,
      mapping,
      repository,
      options,
    );
    if (interaction.handled) return interaction.result;

    if (event.type === "comment.created" && event.commentId) {
      const participant = await repository.findParticipantBySource(
        mapping.workspaceId,
        event.accountId,
        event.commentId,
      );
      if (participant) {
        return processExistingCampaignParticipant(participant, mapping, repository, options);
      }
    }

    for (const campaign of automations) {
      if (campaign.definition.version !== 2) continue;
      const campaignResult = await processCampaignEvent(
        event,
        campaign,
        mapping,
        repository,
        options,
      );
      if (campaignResult.handled) return campaignResult;
    }
  }

  const result: RunnerResult = { matched: 0, sent: 0, skipped: 0, failed: 0 };

  for (const automation of automations) {
    if (automation.definition.version !== 1) continue;

    const dedupeKey = `${automation.id}:${event.id}`;
    if (await repository.hasExecution(mapping.workspaceId, dedupeKey)) continue;

    const evaluation = evaluateFlow(automation.definition, event);
    if (evaluation.status === "skipped") {
      await repository.recordExecution({
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        externalEventId: event.id,
        dedupeKey,
        status: "SKIPPED",
        reason: evaluation.reason,
      });
      result.skipped += 1;
      continue;
    }

    result.matched += 1;
    if (!options.client) {
      await repository.recordExecution({
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        externalEventId: event.id,
        dedupeKey,
        status: "SKIPPED",
        reason: "Meta delivery is disabled in demo mode",
      });
      result.skipped += 1;
      continue;
    }

    if (!options.tokenEncryptionKey) {
      await repository.recordExecution({
        workspaceId: mapping.workspaceId,
        automationId: automation.id,
        externalEventId: event.id,
        dedupeKey,
        status: "FAILED",
        reason: "Token encryption key is not configured",
      });
      result.failed += 1;
      continue;
    }

    const claimed = await repository.claimExecution({
      workspaceId: mapping.workspaceId,
      automationId: automation.id,
      externalEventId: event.id,
      dedupeKey,
    });
    if (!claimed) continue;

    try {
      const connection = metaConnection(mapping.connection, options.tokenEncryptionKey);
      let providerMessageId: string | undefined;
      for (const action of evaluation.actions) {
        providerMessageId = (await sendAction(options.client, connection, action)) ?? providerMessageId;
      }
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "SENT",
        providerMessageId,
      });
      result.sent += 1;
    } catch (error) {
      if (error instanceof MetaApiError && error.retryable && !options.finalAttempt) {
        await repository.releaseExecutionClaim(mapping.workspaceId, dedupeKey);
        throw error;
      }
      await repository.completeExecution(mapping.workspaceId, dedupeKey, {
        status: "FAILED",
        reason: error instanceof Error ? error.message : "Meta delivery failed",
      });
      result.failed += 1;
    }
  }

  return result;
}
