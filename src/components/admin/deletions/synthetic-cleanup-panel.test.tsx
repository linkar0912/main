// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyntheticCleanupPanel } from "./synthetic-cleanup-panel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("SyntheticCleanupPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    refresh.mockReset();
  });
  afterEach(cleanup);

  it("shows only aggregate impact and requires the exact challenge phrase", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      data: {
        count: 58,
        membershipsAffected: 48,
        ownedWorkspacesAffected: 48,
        protectedAccountsExcluded: 0,
        digest: "a".repeat(64),
        confirmationPhrase: "DELETE 58 SYNTHETIC ACCOUNTS",
        challenge: { token: "challenge-token-long-enough", expiresAt: "2026-09-05T20:00:00.000Z" },
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    render(<SyntheticCleanupPanel />);
    fireEvent.change(screen.getByLabelText("Operator reason"), { target: { value: "remove generated test accounts" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview test accounts" }));

    expect(await screen.findByText("58")).toBeTruthy();
    const queueButton = screen.getByRole("button", { name: "Queue permanent cleanup" }) as HTMLButtonElement;
    expect(queueButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Type exactly/), { target: { value: "DELETE 58 SYNTHETIC ACCOUNTS" } });
    expect(queueButton.disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/deletions/synthetic/preview", expect.objectContaining({ method: "POST" }));
  });

  it("queues only the digest and single-use challenge returned by the preview", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
        count: 1, membershipsAffected: 0, ownedWorkspacesAffected: 0, protectedAccountsExcluded: 0,
        digest: "a".repeat(64), confirmationPhrase: "DELETE 1 SYNTHETIC ACCOUNTS",
        challenge: { token: "challenge-token-long-enough", expiresAt: "2026-09-05T20:00:00.000Z" },
      } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "del_batch" } }), { status: 202, headers: { "content-type": "application/json" } }));

    render(<SyntheticCleanupPanel />);
    fireEvent.change(screen.getByLabelText("Operator reason"), { target: { value: "remove generated test accounts" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview test accounts" }));
    await screen.findByText("DELETE 1 SYNTHETIC ACCOUNTS");
    fireEvent.change(screen.getByLabelText(/Type exactly/), { target: { value: "DELETE 1 SYNTHETIC ACCOUNTS" } });
    fireEvent.click(screen.getByRole("button", { name: "Queue permanent cleanup" }));

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(globalThis.fetch).toHaveBeenLastCalledWith("/api/admin/deletions/synthetic", expect.objectContaining({
      body: JSON.stringify({
        impactDigest: "a".repeat(64),
        confirmation: "DELETE 1 SYNTHETIC ACCOUNTS",
        challengeToken: "challenge-token-long-enough",
      }),
    }));
  });
});
