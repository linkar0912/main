type NewAutomationTargetParams = {
  provider?: string;
  surface?: string;
  connection?: string;
  media?: string;
};

type NewAutomationTarget = {
  initialFacebookPageId?: string;
  initialMediaIds?: string[];
};

export function parseNewAutomationTarget(params: NewAutomationTargetParams): NewAutomationTarget {
  const target: NewAutomationTarget = {};
  if (
    params.provider === "facebook" &&
    params.surface === "comment" &&
    typeof params.connection === "string" &&
    params.connection.trim().length > 0
  ) {
    target.initialFacebookPageId = params.connection.trim();
  }

  if (typeof params.media === "string" && params.media.trim().length > 0) {
    target.initialMediaIds = [params.media.trim()];
  }

  return target;
}
