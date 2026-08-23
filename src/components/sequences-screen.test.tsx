// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SequencesScreen } from "./sequences-screen";

vi.mock("next/navigation", () => ({ usePathname: () => "/automations/sequences" }));

describe("SequencesScreen", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sends an explicit null when an existing source automation is cleared", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method && url === "/api/sequences") {
        return new Response(JSON.stringify({ data: [{
          id: "sequence_1",
          name: "Nurture",
          status: "DRAFT",
          sourceAutomationId: "automation_1",
          steps: [{ id: "step_1", delayHours: 0, text: "Hello" }],
          enrolledCount: 0,
        }] }), { status: 200 });
      }
      if (!init?.method && url === "/api/automations") {
        return new Response(JSON.stringify({ data: [{ id: "automation_1", name: "Lead capture", version: 1 }] }), { status: 200 });
      }
      if (init?.method === "PATCH" && url === "/api/sequences/sequence_1") {
        return new Response(JSON.stringify({ data: { id: "sequence_1" } }), { status: 200 });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("scrollTo", vi.fn());

    render(<SequencesScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Nurture" }));
    fireEvent.change(screen.getByLabelText(/enroll leads captured by/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/sequences/sequence_1" && init?.method === "PATCH");
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({ sourceAutomationId: null });
    });
  });
});
