import { describe, expect, it, vi } from "vitest";
const append = vi.hoisted(() => vi.fn());
vi.mock("./audit", () => ({ appendAdminAuditEvent: append }));
import { runAuditedAdminMutation } from "./http";
import type { AdminWriteContext } from "./request-guard";
it("records a safe fallback for database or provider exception text", async () => {
  const context = { owner: {}, requestId: "test" } as AdminWriteContext;
  await expect(runAuditedAdminMutation(context, async () => { throw new Error("redis://user:secret@host connection failed"); })).rejects.toThrow();
  expect(append.mock.calls.at(-1)?.[0].errorCode).toBe("operation_failed");
  expect(JSON.stringify(append.mock.calls)).not.toContain("secret@host");
});
it("retains structured operator error codes", async () => {
  await expect(runAuditedAdminMutation({ owner: {} } as AdminWriteContext, async () => { throw Object.assign(new Error("provider details"), { code: "stale_version" }); })).rejects.toThrow();
  expect(append.mock.calls.at(-1)?.[0].errorCode).toBe("stale_version");
});

it("stops a duplicate audited attempt before executing side effects", async () => {
  append.mockRejectedValueOnce(Object.assign(new Error("operation_already_requested"), { status: 409, code: "operation_already_requested" }));
  const operation = vi.fn();
  await expect(runAuditedAdminMutation({ owner: {} } as AdminWriteContext, operation)).rejects.toMatchObject({ code: "operation_already_requested" });
  expect(operation).not.toHaveBeenCalled();
});
