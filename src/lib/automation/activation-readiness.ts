import type { AutomationProvider, AutomationRepository } from "../repository";
import { getRepository } from "../repository-provider";
import { toReadableValidationError } from "../validation-error";
import { resolveInstagramAccountId } from "./account-pin";
import { deriveAutomationSurface, validateDefinitionForTarget } from "./channels/registry";
import type { ChannelValidationIssue } from "./channels/types";
import { validateFlowDefinition } from "./definition";
import { resolveFacebookPageId } from "./facebook-page-pin";
import type { FlowDefinition } from "./types";

/** The channel state an automation would end up in after a write. */
export type AutomationTargetState = {
  provider: AutomationProvider;
  instagramAccountId?: string | null;
  facebookPageId?: string | null;
  definition: unknown;
};

export type ReadinessResult =
  | { ok: true; definition: FlowDefinition }
  | { ok: false; error: string; issues?: ChannelValidationIssue[] };

/**
 * The stored definition still has to pass today's schema and the channel's
 * capability rules: definitions saved before a rule tightened (or restored
 * from an old snapshot) would otherwise go live and fail on every event.
 */
export function checkDefinitionForTarget(target: AutomationTargetState): ReadinessResult {
  let definition: FlowDefinition;
  try {
    definition = validateFlowDefinition(target.definition);
  } catch (error) {
    const detail = toReadableValidationError(error, "");
    return {
      ok: false,
      error: `This automation's setup is incomplete${detail ? ` (${detail})` : ""}. Open it in the editor, fix it and save.`,
    };
  }
  const issues = validateDefinitionForTarget(definition, {
    provider: target.provider,
    surface: target.provider === "FACEBOOK" ? "COMMENT" : deriveAutomationSurface(definition),
  });
  if (issues.length > 0) {
    return {
      ok: false,
      error: "This automation has settings that are not supported by the selected channel.",
      issues,
    };
  }
  return { ok: true, definition };
}

/**
 * A pin that is set must still be a CONNECTED account/Page of this workspace.
 * With `requirePin` (anything going ACTIVE) an unpinned automation is refused
 * too, so nothing is switched on that cannot actually send.
 */
export async function checkConnectedPin(
  workspaceId: string,
  target: AutomationTargetState,
  options: { requirePin: boolean },
  repository: AutomationRepository = getRepository(),
): Promise<string | null> {
  if (target.provider === "FACEBOOK") {
    if (!target.facebookPageId) {
      return options.requirePin ? "Choose a connected Facebook Page before switching this automation on." : null;
    }
    const pageId = await resolveFacebookPageId(workspaceId, target.facebookPageId, repository);
    return pageId
      ? null
      : "The Facebook Page this automation uses is no longer connected. Reconnect it in Settings or choose another Page.";
  }
  if (!target.instagramAccountId) {
    return options.requirePin ? "Choose a connected Instagram account before switching this automation on." : null;
  }
  const accountId = await resolveInstagramAccountId(workspaceId, target.instagramAccountId, repository);
  return accountId
    ? null
    : "The Instagram account this automation uses is no longer connected. Reconnect it in Settings or choose another account.";
}

/** Everything that must hold before an automation may be ACTIVE. */
export async function checkActivationReadiness(
  workspaceId: string,
  target: AutomationTargetState,
  repository: AutomationRepository = getRepository(),
): Promise<ReadinessResult> {
  const pinError = await checkConnectedPin(workspaceId, target, { requirePin: true }, repository);
  if (pinError) return { ok: false, error: pinError };
  return checkDefinitionForTarget(target);
}
