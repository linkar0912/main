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

function write(level: LogLevel, message: string, context?: LogContext): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel]) return;
    const line = JSON.stringify({
        time: new Date().toISOString(),
        level,
        message,
        ...(context ?? {}),
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