// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SequencesScreen } from "./sequences-screen";

vi.mock("next/navigation", () => ({ usePathname: () => "/automations/sequences" }));

describe("SequencesScreen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps creation controls in one sequence action group", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/sequences" || String(input) === "/api/automations") {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      throw new Error(`Unhandled fetch: ${String(input)}`);
    }));

    render(<SequencesScreen />);
    await screen.findByText(/No sequences yet/i);

    const actionGroup = document.querySelector(".sequence-form-actions");
    expect(actionGroup).toBeTruthy();
    expect(actionGroup?.textContent).toContain("Add step");
    expect(actionGroup?.textContent).toContain("Create sequence");
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
        return new Response(JSON.stringify({ data: [{ id: "automation_1", name: "Lead capture", version: 7, definition: { version: 1 } }] }), { status: 200 });
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

  it("refetches when Refresh is used", async () => {
    // This was a Link to the page it already sits on: a soft navigation that
    // never remounts the screen, so the mount-time fetch never re-ran.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/sequences" || String(input) === "/api/automations") {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      throw new Error(`Unhandled fetch: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SequencesScreen />);
    await screen.findByText(/No sequences yet/i);
    const before = fetchMock.mock.calls.filter(([url]) => String(url) === "/api/sequences").length;

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/sequences").length).toBe(before + 1);
    });
  });

  it("gives every added step a distinct id even when added within the same millisecond", async () => {
    // Step ids were `step-${Date.now()}`, so two quick clicks produced a
    // duplicate pair that the API rejects with "Step IDs must be unique".
    // Pinning the clock makes that collision deterministic rather than a race
    // the test only sometimes loses.
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!init?.method && (url === "/api/sequences" || url === "/api/automations")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      if (init?.method === "POST" && url === "/api/sequences") {
        return new Response(JSON.stringify({ data: { id: "sequence_new" } }), { status: 201 });
      }
      throw new Error(`Unhandled fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SequencesScreen />);
    await screen.findByText(/No sequences yet/i);

    fireEvent.change(screen.getByLabelText(/sequence name/i), { target: { value: "Nurture" } });
    fireEvent.click(screen.getByRole("button", { name: /add step/i }));
    fireEvent.click(screen.getByRole("button", { name: /add step/i }));
    const messages = screen.getAllByLabelText(/^message$/i);
    messages.forEach((field, index) => fireEvent.change(field, { target: { value: `Step ${index + 1}` } }));
    fireEvent.click(screen.getByRole("button", { name: /create sequence/i }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/sequences" && init?.method === "POST");
      expect(post).toBeDefined();
      const ids = JSON.parse(String(post?.[1]?.body)).steps.map((step: { id: string }) => step.id);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
    });
  });

  it("shows the sequence API error instead of a false empty state", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/sequences") {
        return new Response(JSON.stringify({ error: "Sequence service unavailable" }), { status: 503 });
      }
      if (String(input) === "/api/automations") {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      throw new Error(`Unhandled fetch: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SequencesScreen />);

    expect((await screen.findByRole("alert")).textContent).toContain("Sequence service unavailable");
    expect(screen.queryByText(/No sequences yet/i)).toBeNull();
  });

  it("offers only classic flows as sources, by definition version rather than the edit counter", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/sequences") return new Response(JSON.stringify({ data: [] }), { status: 200 });
      if (String(input) === "/api/automations") {
        return new Response(JSON.stringify({ data: [
          // Edited classic flow: the record counter moved past 1, the flow shape did not.
          { id: "classic_edited", name: "Classic edited", version: 4, definition: { version: 1 } },
          // A campaign whose record counter happens to be 1.
          { id: "campaign_new", name: "Campaign new", version: 1, definition: { version: 2 } },
        ] }), { status: 200 });
      }
      throw new Error(`Unhandled fetch: ${String(input)}`);
    }));

    render(<SequencesScreen />);
    await screen.findByText(/No sequences yet/i);

    const select = screen.getByLabelText(/enroll leads captured by/i);
    const options = Array.from(select.querySelectorAll("option")).map((option) => option.textContent);
    expect(options).toContain("Classic edited");
    expect(options).not.toContain("Campaign new");
  });

  it("defaults new steps inside Meta's 24-hour window and caps the delay input there", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/sequences" || String(input) === "/api/automations") {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      throw new Error(`Unhandled fetch: ${String(input)}`);
    }));

    render(<SequencesScreen />);
    await screen.findByText(/No sequences yet/i);
    fireEvent.click(screen.getByRole("button", { name: /add step/i }));

    const delays = screen.getAllByLabelText(/send after \(hours\)/i) as HTMLInputElement[];
    expect(delays[1].value).toBe("23");
    expect(delays[1].max).toBe("23");
    expect(screen.getAllByText(/within 24 hours/i).length).toBeGreaterThan(0);
  });

  it("blocks saving a step delay past the 24-hour window", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method && (String(input) === "/api/sequences" || String(input) === "/api/automations")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      throw new Error(`Unhandled fetch: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SequencesScreen />);
    await screen.findByText(/No sequences yet/i);
    fireEvent.change(screen.getByLabelText(/sequence name/i), { target: { value: "Nurture" } });
    fireEvent.click(screen.getByRole("button", { name: /add step/i }));
    screen.getAllByLabelText(/^message$/i).forEach((field) => fireEvent.change(field, { target: { value: "Hi" } }));
    fireEvent.change(screen.getAllByLabelText(/send after \(hours\)/i)[1], { target: { value: "48" } });
    // Submit the form directly: the input's max already stops a native submit,
    // this checks the guard behind it.
    fireEvent.submit(screen.getByRole("button", { name: /create sequence/i }).closest("form")!);

    expect(await screen.findByText(/at most 23 hours/i)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
});
