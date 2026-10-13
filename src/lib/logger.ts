type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const configuredLevel = ((): LogLevel => {
    const value = process.env.LOG_LEVEL?.trim().toLowerCase();
    return value === "debug" || value === "info" || value === "warn" || value === "error"
        ? value
        : process.env.NODE_ENV === "production"
            ? "info"
            : "debug";
})();

const REDACTED = "[redacted]";

/** Keys whose values are credentials whatever they hold. */
const SENSITIVE_KEY = /(token|secret|password|passwd|authorization|cookie|signature|api[-_]?key)s?$/i;

/**
 * Credentials and addresses that can hide inside free text - a provider error
 * message that echoes the request URL, an exception that quotes a header.
 * Call sites already mask what they know about; this is the backstop.
 */
const SENSITIVE_TEXT: [RegExp, string][] = [
    [/\b(access_token|refresh_token|id_token|client_secret|appsecret_proof|token)=[^&\s"']+/gi, `$1=${REDACTED}`],
    [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/g, `Bearer ${REDACTED}`],
    // Meta user/page tokens and Instagram tokens.
    [/\b(?:EAA[A-Za-z0-9]{20,}|IG(?:QV|AA)[A-Za-z0-9_-]{20,})/g, REDACTED],
    // JWTs (Supabase access tokens, Google id tokens).
    [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
    // Email addresses keep their first character and domain: a***@example.com.
    [/\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g, "$1***@$2"],
];

function scrubText(value: string): string {
    return SENSITIVE_TEXT.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function redact(value: unknown, depth = 0): unknown {
    if (typeof value === "string") return scrubText(value);
    if (value === null || typeof value !== "object" || depth > 5) return value;
    if (value instanceof Date) return value;
    // Decimal, URL and friends serialize through toJSON; keep that shape.
    if (typeof (value as { toJSON?: unknown }).toJSON === "function") return redact((value as { toJSON(): unknown }).toJSON(), depth + 1);
    if (value instanceof Error) return { name: value.name, message: scrubText(value.message) };
    if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
        out[key] = SENSITIVE_KEY.test(key) && entry !== null && entry !== undefined && entry !== "" ? REDACTED : redact(entry, depth + 1);
    }
    return out;
}

/** Exported for tests: what a context object looks like once it reaches the log. */
export function redactLogContext(context: LogContext): LogContext {
    return redact(context) as LogContext;
}

function write(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel]) return;
    // Context first: a caller-supplied `level`/`message`/`time` key must never
    // overwrite the fields log drivers and alerting key off. Tokens and email
    // addresses are scrubbed from both before anything is written.
    const line = JSON.stringify({
        ...(context ? redactLogContext(context) : {}),
        time: new Date().toISOString(),
        level,
        message: scrubText(message),
    });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
}

/**
 * Minimal structured logger emitting single-line JSON so container log
 * drivers can parse fields without extra dependencies. Replaceable with
 * pino/OTel later without touching call sites.
 */
export const logger = {
    debug(message: string, context?: LogContext): void {
        write("debug", message, context);
    },
    info(message: string, context?: LogContext): void {
        write("info", message, context);
    },
    warn(message: string, context?: LogContext): void {
        write("warn", message, context);
    },
    error(message: string, context?: LogContext): void {
        write("error", message, context);
    },
};