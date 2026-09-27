import { after } from "next/server";
import { logger } from "./logger";

/**
 * Runs bookkeeping (click counting, callbacks) after the response has gone out,
 * so a visitor is never held on a redirect by a write they don't need.
 * Outside a Next request scope - unit tests, scripts - `after` throws, and the
 * task simply starts in the background instead.
 */
export function afterResponse(label: string, task: () => Promise<unknown>): void {
  const run = async () => {
    try {
      await task();
    } catch (error) {
      logger.warn(`${label} failed`, { error: error instanceof Error ? error.message : String(error) });
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
