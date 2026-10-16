import type { FacebookConnection, FacebookSendResult } from "./types";
import { withAppSecretProof } from "./appsecret-proof";
import { isMetaAccountBlock, isMetaRateLimit, parseMetaUsageHeaders, type MetaUsage } from "../meta/errors";

/** Error class parallel to `MetaApiError` so the runner can classify FB calls
 * the same way it classifies IG calls (retryable vs not, transient vs
 * permanent, transport vs HTTP). */
export class FacebookApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly responseReceived: boolean;
  readonly graphCode?: number;
  /** Graph `error_subcode`; Meta sometimes sends #2022 (a blocked sender) only here. */
  readonly subcode?: number;
  /** Meta's usage headers on the rejected response, when it sent them (see parseMetaUsageHeaders). */
  readonly usage: MetaUsage | null;

  constructor(
    message: string,
    status: number,
    responseReceived = status > 0,
    retryable = status === 0 || status === 408 || status === 429 || status >= 500,
    graphCode?: number,
    subcode?: number,
    usage?: MetaUsage | null,
  ) {
    super(message);
    this.name = "FacebookApiError";
    this.status = status;
    this.responseReceived = responseReceived;
    this.retryable = retryable;
    this.graphCode = graphCode;
    this.subcode = subcode;
    this.usage = usage ?? null;
  }
}

/**
 * Graph 80001, "There have been too many calls to this Page account": the
 * Pages rate limit. META_RATE_LIMIT_CODES has Instagram's own (80002) but not
 * this one, so the Page classification adds it.
 */
const PAGE_RATE_LIMIT_CODE = 80001;

/**
 * What a Page call's rejection says about the whole Page, read the same way
 * as an Instagram send's (providerAccountSignal in outbound-delivery.ts): an
 * account-level block (368 or #2022) or a request to slow down. Only an
 * answer Meta actually sent counts, never a transport failure.
 */
export function facebookAccountSignal(error: unknown): "account_blocked" | "rate_limited" | null {
  if (!(error instanceof FacebookApiError) || !error.responseReceived || error.status <= 0) return null;
  if (isMetaAccountBlock({ code: error.graphCode, subcode: error.subcode, message: error.message })) return "account_blocked";
  if (error.graphCode === PAGE_RATE_LIMIT_CODE || isMetaRateLimit({ status: error.status, code: error.graphCode })) {
    return "rate_limited";
  }
  return null;
}

/** Meta's usage headers from a response already in hand; never throws, null when absent. */
function responseUsage(response: Response): MetaUsage | null {
  try {
    return response.headers ? parseMetaUsageHeaders(response.headers) : null;
  } catch {
    return null;
  }
}

type FacebookClientOptions = {
  apiVersion: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  requestTimeoutMs?: number;
  /**
   * App secret used to sign each call with `appsecret_proof`. Optional so demo
   * mode and tests can run unsigned, but it should always be set in production.
   */
  appSecret?: string;
};

/**
 * Graph codes for a temporary failure, plus the Pages rate limit (80001).
 * The shared throttling codes come from META_RATE_LIMIT_CODES through
 * isMetaRateLimit, as in the Instagram client, so the lists cannot drift apart.
 */
const TRANSIENT_FACEBOOK_CODES = new Set([1, 2, 341, PAGE_RATE_LIMIT_CODE]);

function isTransientFacebookError(error: Record<string, unknown>, status: number): boolean {
  const code = typeof error.code === "number" ? error.code : undefined;
  return status === 429 || status >= 500 || error.is_transient === true ||
    (code !== undefined && TRANSIENT_FACEBOOK_CODES.has(code)) ||
    isMetaRateLimit({ status, code });
}

/**
 * Minimal Page-scoped Graph API client for public Page comment replies.
 *
 * We deliberately do NOT extend `MetaClient`: the URL, auth, and payload
 * shapes are different enough that a wrapper would obscure more than it would
 * share. Adding a second client also keeps the FB secret footprint small.
 */
export class FacebookClient {
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly requestTimeoutMs: number;
  private readonly appSecret?: string;

  constructor(options: FacebookClientOptions) {
    this.apiVersion = options.apiVersion;
    this.baseUrl = options.baseUrl ?? "https://graph.facebook.com";
    this.fetcher = options.fetcher ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.appSecret = options.appSecret;
    if (!Number.isInteger(this.requestTimeoutMs) || this.requestTimeoutMs <= 0) {
      throw new Error("Facebook request timeout must be a positive integer");
    }
  }

  private async request(
    url: URL,
    accessToken: string,
    init: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    // Graph error messages follow the Page's language unless asked otherwise.
    url.searchParams.set("locale", "en_US");
    // Signed here rather than per call site so any endpoint added later is
    // covered automatically.
    withAppSecretProof(url, accessToken, this.appSecret);
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: { authorization: `Bearer ${accessToken}`, ...init.headers },
        signal: init.signal ?? AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException
        && (error.name === "AbortError" || error.name === "TimeoutError");
      throw new FacebookApiError(timedOut ? "Facebook request timed out" : "Facebook network request failed", 0, false);
    }
    let data: Record<string, unknown>;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      if (!response.ok) {
        throw new FacebookApiError(
          `Facebook request failed (${response.status})`,
          response.status,
          true,
          undefined,
          undefined,
          undefined,
          responseUsage(response),
        );
      }
      throw new FacebookApiError("Facebook response could not be parsed", 0, true);
    }
    if (!response.ok) {
      const error = typeof data.error === "object" && data.error !== null ? data.error as Record<string, unknown> : {};
      throw new FacebookApiError(
        typeof error.message === "string" ? error.message : `Facebook request failed (${response.status})`,
        response.status,
        true,
        isTransientFacebookError(error, response.status),
        typeof error.code === "number" ? error.code : undefined,
        typeof error.error_subcode === "number" ? error.error_subcode : undefined,
        responseUsage(response),
      );
    }
    return data;
  }

  /**
   * Post a public comment reply on a Page post. Unlike Instagram's
   * "private reply" mechanism, Facebook expects a normal comment against
   * the same post with a `parent` parameter set to the comment id, so the
   * reply nests under the original comment in the UI.
   */
  async postCommentReply(
    connection: FacebookConnection,
    commentId: string,
    message: string,
  ): Promise<FacebookSendResult> {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${commentId}/comments`);
    const data = await this.request(url, connection.accessToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    });
    return { id: typeof data.id === "string" ? data.id : undefined };
  }

  async getProfilePictureUrl(connection: FacebookConnection, profileId: string): Promise<string | null> {
    // Interpolated into the Graph path, so only a numeric id is acceptable.
    if (!/^\d{1,32}$/.test(profileId)) return null;
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${profileId}`);
    url.searchParams.set("fields", "picture.type(square).width(96).height(96)");
    const data = await this.request(url, connection.accessToken);
    const picture = typeof data.picture === "object" && data.picture !== null
      ? data.picture as Record<string, unknown>
      : undefined;
    const pictureData = picture && typeof picture.data === "object" && picture.data !== null
      ? picture.data as Record<string, unknown>
      : undefined;
    return pictureData && typeof pictureData.url === "string" && pictureData.url ? pictureData.url : null;
  }

}
