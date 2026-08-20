import type { MetaConnection, MetaMessage, MetaSendResult } from "./types";

type MetaClientOptions = {
  apiVersion: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export class MetaApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
    this.retryable = status === 429 || status >= 500;
  }
}

export function buildPrivateReplyPayload(commentId: string, text: string) {
  return { recipient: { comment_id: commentId }, message: { text } };
}

export function buildDirectMessagePayload(recipientId: string, message: MetaMessage) {
  if (message.type === "text") {
    return { recipient: { id: recipientId }, message: { text: message.text } };
  }
  return {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: message.text,
          buttons: [{ type: "web_url", url: message.url, title: message.type === "link" ? "Open link" : message.buttonLabel }],
        },
      },
    },
  };
}

export class MetaClient {
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: MetaClientOptions) {
    this.apiVersion = options.apiVersion;
    this.baseUrl = options.baseUrl ?? "https://graph.instagram.com";
    this.fetcher = options.fetcher ?? fetch;
  }

  async sendPrivateReply(connection: MetaConnection, commentId: string, text: string): Promise<MetaSendResult> {
    return this.post(connection, buildPrivateReplyPayload(commentId, text));
  }

  async sendDirectMessage(connection: MetaConnection, recipientId: string, message: MetaMessage): Promise<MetaSendResult> {
    return this.post(connection, buildDirectMessagePayload(recipientId, message));
  }

  private async post(connection: MetaConnection, payload: unknown): Promise<MetaSendResult> {
    const response = await this.fetcher(
      `${this.baseUrl}/${this.apiVersion}/${connection.igUserId}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${connection.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const error = typeof data.error === "object" && data.error !== null ? data.error as Record<string, unknown> : {};
      throw new MetaApiError(typeof error.message === "string" ? error.message : `Meta request failed (${response.status})`, response.status);
    }
    return {
      recipient_id: typeof data.recipient_id === "string" ? data.recipient_id : undefined,
      message_id: typeof data.message_id === "string" ? data.message_id : undefined,
    };
  }
}
