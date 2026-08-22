import type { MetaConnection, MetaMedia, MetaMediaPage, MetaMessage, MetaPrivateReply, MetaSendResult } from "./types";

type MetaClientOptions = {
  apiVersion: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export class MetaApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable?: boolean) {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
    this.retryable = retryable ?? (status === 429 || status >= 500);
  }
}

const MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,media_url,thumbnail_url,timestamp";
const MEDIA_TYPES = new Set<MetaMedia["mediaType"]>(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"]);
const MEDIA_PRODUCT_TYPES = new Set<NonNullable<MetaMedia["mediaProductType"]>>(["AD", "FEED", "REELS", "STORY"]);
const INSTAGRAM_LOGIN_API_VERSION = "v25.0";

/**
 * Webhook fields every connection needs: comment triggers and campaigns ride on
 * `comments`, and all DM-side automation (messages, quick replies, postbacks,
 * referrals, story mentions) arrives through `messages`.
 */
const CORE_WEBHOOK_FIELDS = ["comments", "messages"] as const;

/**
 * Messenger-era field names kept for parity wherever the platform accepts them.
 * Business Login for Instagram (graph.instagram.com) rejects unknown names with
 * #100, so they are attempted first and dropped on rejection.
 */
const EXTENDED_WEBHOOK_FIELDS = [...CORE_WEBHOOK_FIELDS, "messaging_postbacks", "messaging_optins", "messaging_referral"] as const;

export type WebhookSubscriptionResult = {
  /** Fields Meta confirmed subscribed (best effort — empty when nothing stuck). */
  fields: string[];
  /** The set originally requested, for diagnosing degraded results. */
  requested: string[];
  /** Present when Meta rejected every attempt or never confirmed success. */
  error?: string;
};

export function buildPrivateReplyPayload(commentId: string, message: string | MetaPrivateReply) {
  const normalized = typeof message === "string" ? { text: message } : message;
  return {
    recipient: { comment_id: commentId },
    message: {
      text: normalized.text,
      ...(normalized.quickReply ? {
        quick_replies: [{
          content_type: "text" as const,
          title: normalized.quickReply.title,
          payload: normalized.quickReply.payload,
        }],
      } : {}),
    },
  };
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
    if (options.apiVersion !== INSTAGRAM_LOGIN_API_VERSION) {
      throw new Error(`Meta client requires Instagram Login API version ${INSTAGRAM_LOGIN_API_VERSION}`);
    }
    this.apiVersion = options.apiVersion;
    this.baseUrl = options.baseUrl ?? "https://graph.instagram.com";
    this.fetcher = options.fetcher ?? fetch;
  }

  async replyToComment(connection: MetaConnection, commentId: string, text: string): Promise<{ id: string }> {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${commentId}/replies`);
    const data = asRecord(await this.request(url, connection.accessToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    }));
    if (!data || typeof data.id !== "string" || !data.id) {
      throw new MetaApiError("Meta did not return comment reply ID", 502);
    }
    return { id: data.id };
  }

  async sendPrivateReply(connection: MetaConnection, commentId: string, message: string | MetaPrivateReply): Promise<MetaSendResult> {
    return this.post(connection, buildPrivateReplyPayload(commentId, message));
  }

  async sendDirectMessage(connection: MetaConnection, recipientId: string, message: MetaMessage): Promise<MetaSendResult> {
    return this.post(connection, buildDirectMessagePayload(recipientId, message));
  }

  async sendQuickReply(
    connection: MetaConnection,
    recipientId: string,
    text: string,
    reply: NonNullable<MetaPrivateReply["quickReply"]>,
  ): Promise<MetaSendResult> {
    return this.post(connection, {
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: {
        text,
        quick_replies: [{ content_type: "text", title: reply.title, payload: reply.payload }],
      },
    });
  }

  async listMedia(connection: MetaConnection, after?: string): Promise<MetaMediaPage> {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${connection.igUserId}/media`);
    url.searchParams.set("fields", MEDIA_FIELDS);
    if (after !== undefined) url.searchParams.set("after", after);
    const data = asRecord(await this.request(url, connection.accessToken));
    if (!data || !Array.isArray(data.data)) throw new MetaApiError("Meta did not return valid media", 502);
    const paging = asRecord(data.paging);
    if (data.paging !== undefined && !paging) throw new MetaApiError("Meta did not return valid media", 502);
    const cursors = paging ? asRecord(paging.cursors) : undefined;
    if (paging?.cursors !== undefined && !cursors) throw new MetaApiError("Meta did not return valid media", 502);
    if (cursors?.after !== undefined && typeof cursors.after !== "string") {
      throw new MetaApiError("Meta did not return valid media", 502);
    }
    return {
      data: data.data.map(normalizeMedia),
      ...(typeof cursors?.after === "string" ? { after: cursors.after } : {}),
    };
  }

  async getMedia(connection: MetaConnection, mediaId: string): Promise<MetaMedia> {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${mediaId}`);
    url.searchParams.set("fields", MEDIA_FIELDS);
    return normalizeMedia(await this.request(url, connection.accessToken));
  }

  async getUserFollowStatus(connection: MetaConnection, igScopedUserId: string): Promise<{ isUserFollowingBusiness: boolean }> {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${igScopedUserId}`);
    url.searchParams.set("fields", "is_user_follow_business");
    const data = asRecord(await this.request(url, connection.accessToken));
    if (!data || typeof data.is_user_follow_business !== "boolean") {
      throw new MetaApiError("Meta did not return follower status", 502);
    }
    return { isUserFollowingBusiness: data.is_user_follow_business };
  }

  async subscribeToWebhooks(connection: MetaConnection): Promise<WebhookSubscriptionResult> {
    const attempts: readonly (readonly string[])[] = [EXTENDED_WEBHOOK_FIELDS, CORE_WEBHOOK_FIELDS];
    let lastError = "Meta did not confirm any webhook subscription";
    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
      const fields = attempts[attemptIndex];
      try {
        const url = new URL(`${this.baseUrl}/${this.apiVersion}/${connection.igUserId}/subscribed_apps`);
        url.searchParams.set("subscribed_fields", fields.join(","));
        const data = asRecord(await this.request(url, connection.accessToken, { method: "POST" }));
        if (!data || data.success !== true) throw new MetaApiError("Meta did not confirm the webhook subscription", 502);
        return { fields: [...fields], requested: [...EXTENDED_WEBHOOK_FIELDS] };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    // Subscription is best-effort: the OAuth connection itself stays valid, and the
    // settings health check surfaces whatever Meta is not sending. Business Login
    // for Instagram rejects some Messenger-era field names with #100, so degrading
    // here beats failing the whole connect flow.
    return { fields: [], requested: [...EXTENDED_WEBHOOK_FIELDS], error: lastError };
  }

  async getSubscribedFields(connection: MetaConnection): Promise<string[]> {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${connection.igUserId}/subscribed_apps`);
    const data = asRecord(await this.request(url, connection.accessToken));
    const entries = data && Array.isArray(data.data) ? data.data : [];
    const fields = new Set<string>();
    for (const entry of entries) {
      const record = asRecord(entry);
      if (!record || !Array.isArray(record.subscribed_fields)) continue;
      for (const field of record.subscribed_fields) {
        if (typeof field === "string") fields.add(field);
      }
    }
    return [...fields];
  }

  async unsubscribeFromWebhooks(connection: MetaConnection): Promise<void> {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${connection.igUserId}/subscribed_apps`);
    const data = await this.request(url, connection.accessToken, { method: "DELETE" });
    if (data.success !== true) throw new MetaApiError("Meta did not confirm the webhook removal", 502);
  }

  async getOwnProfile(connection: MetaConnection): Promise<{ id: string; username: string }> {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/me`);
    url.searchParams.set("fields", "user_id,username");
    const data = await this.request(url, connection.accessToken);
    const id = typeof data.user_id === "string" ? data.user_id :
      typeof data.user_id === "number" ? String(data.user_id) : "";
    if (!id || typeof data.username !== "string") {
      throw new MetaApiError("Meta did not return the connected Instagram profile", 502);
    }
    return { id, username: data.username };
  }

  private async request(url: URL, accessToken: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: { authorization: `Bearer ${accessToken}`, ...init.headers },
      });
    } catch {
      throw new MetaApiError("Meta network request failed", 0, true);
    }
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const error = typeof data.error === "object" && data.error !== null ? data.error as Record<string, unknown> : {};
      throw new MetaApiError(
        typeof error.message === "string" ? error.message : `Meta request failed (${response.status})`,
        response.status,
        isTransientMetaError(error, response.status),
      );
    }
    return data;
  }

  private async post(connection: MetaConnection, payload: unknown): Promise<MetaSendResult> {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${connection.igUserId}/messages`);
    const data = await this.request(url, connection.accessToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return {
      recipient_id: typeof data.recipient_id === "string" ? data.recipient_id : undefined,
      message_id: typeof data.message_id === "string" ? data.message_id : undefined,
    };
  }
}

function normalizeMedia(value: unknown): MetaMedia {
  const media = asRecord(value);
  if (
    !media ||
    typeof media.id !== "string" || !media.id ||
    typeof media.media_type !== "string" || !MEDIA_TYPES.has(media.media_type as MetaMedia["mediaType"]) ||
    typeof media.permalink !== "string" || !media.permalink ||
    typeof media.timestamp !== "string" || !media.timestamp ||
    (media.caption !== undefined && typeof media.caption !== "string") ||
    (media.media_product_type !== undefined &&
      (typeof media.media_product_type !== "string" || !MEDIA_PRODUCT_TYPES.has(media.media_product_type as NonNullable<MetaMedia["mediaProductType"]>))) ||
    (media.media_url !== undefined && typeof media.media_url !== "string") ||
    (media.thumbnail_url !== undefined && typeof media.thumbnail_url !== "string")
  ) {
    throw new MetaApiError("Meta did not return valid media", 502);
  }
  return {
    id: media.id,
    mediaType: media.media_type as MetaMedia["mediaType"],
    permalink: media.permalink,
    timestamp: media.timestamp,
    ...(typeof media.caption === "string" ? { caption: media.caption } : {}),
    ...(typeof media.media_product_type === "string" ? { mediaProductType: media.media_product_type as NonNullable<MetaMedia["mediaProductType"]> } : {}),
    ...(typeof media.media_url === "string" ? { mediaUrl: media.media_url } : {}),
    ...(typeof media.thumbnail_url === "string" ? { thumbnailUrl: media.thumbnail_url } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

const TRANSIENT_META_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

function isTransientMetaError(error: Record<string, unknown>, status: number): boolean {
  return status === 429 || status >= 500 || error.is_transient === true ||
    (typeof error.code === "number" && TRANSIENT_META_CODES.has(error.code));
}
