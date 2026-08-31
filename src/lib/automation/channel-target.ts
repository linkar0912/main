export type AutomationProvider = "INSTAGRAM" | "FACEBOOK";

export type ParsedAutomationTarget =
  | { provider: "INSTAGRAM"; instagramAccountId: string }
  | { provider: "FACEBOOK"; facebookPageId: string };

export function parseAutomationTarget(
  input: { provider?: unknown; instagramAccountId?: unknown; facebookPageId?: unknown },
  options: { requirePin: boolean },
): ParsedAutomationTarget | undefined {
  const targetWasProvided = input.provider !== undefined
    || input.instagramAccountId !== undefined
    || input.facebookPageId !== undefined;
  if (!targetWasProvided && !options.requirePin) return undefined;

  const instagramAccountId = typeof input.instagramAccountId === "string" && input.instagramAccountId.trim()
    ? input.instagramAccountId.trim()
    : undefined;
  const facebookPageId = typeof input.facebookPageId === "string" && input.facebookPageId.trim()
    ? input.facebookPageId.trim()
    : undefined;

  if (input.provider === "INSTAGRAM" && instagramAccountId && !facebookPageId) {
    return { provider: "INSTAGRAM", instagramAccountId };
  }
  if (input.provider === "FACEBOOK" && facebookPageId && !instagramAccountId) {
    return { provider: "FACEBOOK", facebookPageId };
  }
  throw new Error("invalid_channel_target");
}
