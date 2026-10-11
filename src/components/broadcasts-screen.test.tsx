// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BroadcastsScreen } from "./broadcasts-screen";

const running = { id: "broadcast_1", name: "Weekend offer", status: "RUNNING", segment: "all_contacts", total: 10, sent: 3, failed: 0, skipped: 0 };

describe("BroadcastsScreen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows friendly status labels and cancels a sending broadcast after confirmation", async () => {
    let rows = [running, { ...running, id: "broadcast_2", name: "Launch", status: "PENDING" }];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/broadcasts" && !init?.method) return new Response(JSON.stringify({ data: rows }), { status: 200 });
      if (url === "/api/broadcasts/broadcast_1" && init?.method === "PATCH") {
        rows = rows.map((row) => row.id === "broadcast_1" ? { ...row, status: "CANCELLED" } : row);
        return new Response(JSON.stringify({ data: rows[0] }), { status: 200 });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BroadcastsScreen />);

    expect(await screen.findByText("Sending")).toBeTruthy();
    expect(screen.getByText("Scheduled")).toBeTruthy();
    expect(screen.queryByText("RUNNING")).toBeNull();
    // Only the live broadcast shows a progress bar.
    const progress = screen.getByRole("progressbar", { name: "Weekend offer progress" });
    expect(progress.getAttribute("aria-valuenow")).toBe("3");
    expect(progress.getAttribute("aria-valuemax")).toBe("10");
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel Weekend offer" }));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/broadcasts/broadcast_1", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancelling Weekend offer" }));

    await waitFor(() => expect(screen.getByText("Cancelled")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/broadcasts/broadcast_1", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ status: "CANCELLED" }),
    }));
    expect(screen.queryByRole("button", { name: "Cancel Weekend offer" })).toBeNull();
  });

  it("says how many eligible people the per-broadcast cap left out", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/broadcasts" && init?.method === "POST") {
        return new Response(JSON.stringify({ data: running, audience: { eligible: 740, queued: 500, truncated: true } }), { status: 201 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }));

    render(<BroadcastsScreen />);
    await screen.findByText("No broadcasts yet");
    fireEvent.change(screen.getByPlaceholderText("e.g. Weekend offer"), { target: { value: "Drop" } });
    fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "New stock" } });
    fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));

    expect(await screen.findByText(/500 most recently active of 740/)).toBeTruthy();
  });

  it("explains a manager-only refusal instead of showing the error code", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/broadcasts" && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }));

    render(<BroadcastsScreen />);
    await screen.findByText("No broadcasts yet");
    fireEvent.change(screen.getByPlaceholderText("e.g. Weekend offer"), { target: { value: "Drop" } });
    fireEvent.change(screen.getByPlaceholderText("Write the message everyone will get"), { target: { value: "New stock" } });
    fireEvent.click(screen.getByRole("button", { name: "Send broadcast" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm send" }));

    expect(await screen.findByText(/Only workspace owners and admins/)).toBeTruthy();
  });
});
