import type { FlowDefinition } from "../types";
import { facebookPageCommentCapability } from "./facebook-page";
import { instagramCapabilities } from "./instagram";
import type { ChannelCapability, ChannelDescriptor, ChannelSurface, ChannelValidationIssue } from "./types";

export const channelCapabilities: readonly ChannelCapability[] = [
  ...instagramCapabilities,
  facebookPageCommentCapability,
] as const;

export function getChannelCapability(target: ChannelDescriptor): ChannelCapability {
  const capability = channelCapabilities.find((candidate) =>
    candidate.target.provider === target.provider && candidate.target.surface === target.surface);
  if (!capability) throw new Error("unsupported_channel");
  return capability;
}

export function deriveAutomationSurface(definition: FlowDefinition): ChannelSurface {
  return definition.version === 2 || definition.trigger.type === "comment" ? "COMMENT" : "MESSAGING";
}

export function validateDefinitionForTarget(
  definition: FlowDefinition,
  target: ChannelDescriptor,
): ChannelValidationIssue[] {
  let capability: ChannelCapability;
  try {
    capability = getChannelCapability(target);
  } catch {
    return [{ path: ["provider"], message: "This automation channel is not supported" }];
  }

  if (definition.version === 2) {
    return target.provider === "INSTAGRAM" && target.surface === "COMMENT"
      ? []
      : [{ path: ["version"], message: "Campaign automations are currently available only for Instagram comments" }];
  }

  const issues: ChannelValidationIssue[] = [];
  if (!capability.triggers.includes(definition.trigger.type)) {
    issues.push({
      path: ["trigger", "type"],
      message: `${capability.label} do not support ${definition.trigger.type} triggers`,
    });
  }
  definition.actions.forEach((action, index) => {
    if (!capability.actions.includes(action.type)) {
      issues.push({
        path: ["actions", index, "type"],
        message: `${capability.label} do not support ${action.type} actions`,
      });
    }
  });
  return issues;
}

export type { ChannelCapability, ChannelDescriptor, ChannelSurface, ChannelTarget, ChannelValidationIssue } from "./types";
