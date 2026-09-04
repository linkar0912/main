import "server-only";

export type RazorpaySubscription = {
  id: string;
  status: string;
  planId?: string;
  customerId?: string;
  currentStart?: Date;
  currentEnd?: Date;
};

export type CreateSubscriptionInput = {
  planId: string;
  totalCount: number;
  workspaceId: string;
  attemptId: string;
};

export class RazorpayError extends Error {
  constructor(
    public readonly code: "razorpay_request_failed" | "razorpay_invalid_response",
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "RazorpayError";
  }
}

type RazorpayClientOptions = {
  keyId: string;
  keySecret: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalUnixDate(value: unknown): Date | undefined {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1_000) : undefined;
}

function normalizeSubscription(value: unknown): RazorpaySubscription {
  if (!value || typeof value !== "object") throw new RazorpayError("razorpay_invalid_response", 502, false);
  const payload = value as Record<string, unknown>;
  if (typeof payload.id !== "string" || typeof payload.status !== "string") {
    throw new RazorpayError("razorpay_invalid_response", 502, false);
  }
  return {
    id: payload.id,
    status: payload.status,
    planId: optionalString(payload.plan_id),
    customerId: optionalString(payload.customer_id),
    currentStart: optionalUnixDate(payload.current_start),
    currentEnd: optionalUnixDate(payload.current_end),
  };
}

export class RazorpayClient {
  private readonly authorization: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: RazorpayClientOptions) {
    this.authorization = `Basic ${Buffer.from(`${options.keyId}:${options.keySecret}`).toString("base64")}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(path: string, method: "POST" | "PATCH", body: unknown): Promise<RazorpaySubscription> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.fetchImpl(`https://api.razorpay.com/v1${path}`, {
        method,
        headers: {
          authorization: this.authorization,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new RazorpayError("razorpay_request_failed", response.status, response.status >= 500 || response.status === 429);
      }
      return normalizeSubscription(await response.json().catch(() => null));
    } catch (error) {
      if (error instanceof RazorpayError) throw error;
      throw new RazorpayError("razorpay_request_failed", 503, true);
    } finally {
      clearTimeout(timeout);
    }
  }

  createSubscription(input: CreateSubscriptionInput): Promise<RazorpaySubscription> {
    return this.request("/subscriptions", "POST", {
      plan_id: input.planId,
      total_count: input.totalCount,
      customer_notify: 1,
      notes: { workspace_id: input.workspaceId, attempt_id: input.attemptId },
    });
  }

  updateSubscription(input: { subscriptionId: string; planId: string }): Promise<RazorpaySubscription> {
    return this.request(`/subscriptions/${encodeURIComponent(input.subscriptionId)}`, "PATCH", {
      plan_id: input.planId,
      schedule_change_at: "cycle_end",
      customer_notify: 1,
    });
  }

  cancelSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
    return this.request(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, "POST", {
      cancel_at_cycle_end: 1,
    });
  }
}
