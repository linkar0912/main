// Client transport shared by every audited owner command. Each write carries
// the operator reason and a fresh idempotency key; failures surface the
// server's structured error code and never a raw response body.

export class AdminCommandError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = "AdminCommandError";
  }
}

/**
 * Header values must be ISO-8859-1, so a reason with a curly quote, rupee sign,
 * dash, or Devanagari text would make fetch throw. The server decodes it.
 */
export function encodeAdminReason(reason: string): string {
  return encodeURIComponent(reason.trim());
}

export function adminIdempotencyKey(prefix = "admin"): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

type AdminCommandOptions = {
  method?: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  reason: string;
  /** Error code reported when the server does not return a structured one. */
  fallback?: string;
  /** Reuse a key to make a retried submission replay-safe. */
  idempotencyKey?: string;
};

/** Sends an audited command and returns the raw response after a status check. */
export async function adminCommandResponse(url: string, options: AdminCommandOptions): Promise<Response> {
  const response = await fetch(url, {
    method: options.method ?? "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-reason": encodeAdminReason(options.reason),
      "idempotency-key": options.idempotencyKey ?? adminIdempotencyKey(),
    },
    body: JSON.stringify(options.body ?? {}),
  });
  if (!response.ok) {
    // Error pages from a proxy or an outage are not JSON; fall back to the code.
    const payload = await response.json().catch(() => ({})) as { error?: unknown };
    const code = typeof payload.error === "string" && payload.error ? payload.error : options.fallback ?? "admin_operation_failed";
    throw new AdminCommandError(code, response.status);
  }
  return response;
}

/** Sends an audited command and returns the `data` member of its JSON reply. */
export async function adminCommand<T = Record<string, unknown>>(url: string, options: AdminCommandOptions): Promise<T | undefined> {
  const response = await adminCommandResponse(url, options);
  const payload = await response.json().catch(() => ({})) as { data?: T };
  return payload.data;
}

/** Reads an owner-console resource and returns the `data` member of its JSON reply. */
export async function adminQuery<T>(url: string, options: { signal?: AbortSignal; fallback?: string } = {}): Promise<T> {
  const response = await fetch(url, { signal: options.signal, cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: unknown };
  if (!response.ok || payload.data === undefined) {
    const code = typeof payload.error === "string" && payload.error ? payload.error : options.fallback ?? "admin_request_failed";
    throw new AdminCommandError(code, response.status);
  }
  return payload.data;
}

/** Turns a structured code such as `stale_version` into a sentence fragment. */
export function humanizeAdminCode(code: string): string {
  const text = code.replaceAll("_", " ").trim();
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

export function adminErrorMessage(cause: unknown, fallback = "Operation failed"): string {
  if (cause instanceof AdminCommandError) return humanizeAdminCode(cause.code);
  // fetch rejects with a TypeError when the request never reached the server
  // (offline, DNS, CORS, or a header it refused to send). Its message is
  // browser-specific prose, so say what happened instead.
  if (cause instanceof TypeError) return `${fallback}: the request did not reach Linkar. Check your connection and try again.`;
  return fallback;
}

/** Hands a generated file to the browser's download flow. */
export function downloadAdminFile(contents: Blob, filename: string): void {
  const url = URL.createObjectURL(contents);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
