type NewAutomationTargetParams = {
  provider?: string;
  surface?: string;
  connection?: string;
};

type NewAutomationTarget = {
  initialFacebookPageId?: string;
};

export function parseNewAutomationTarget(params: NewAutomationTargetParams): NewAutomationTarget {
  if (
    params.provider === "facebook" &&
    params.surface === "comment" &&
    typeof params.connection === "string" &&
    params.connection.trim().length > 0
  ) {
    return { initialFacebookPageId: params.connection.trim() };
  }

  return {};
}
