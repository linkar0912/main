// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationBuilder } from "./automation-builder";

describe("AutomationBuilder", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a guided comment-to-link automation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "automation_1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AutomationBuilder />);
    fireEvent.change(screen.getByLabelText(/automation name/i), { target: { value: "Guide delivery" } });
    fireEvent.change(screen.getByLabelText(/keywords/i), { target: { value: "guide, pdf" } });
    fireEvent.change(screen.getByLabelText(/action type/i), { target: { value: "send_link" } });
    fireEvent.change(screen.getByLabelText(/message text/i), { target: { value: "Here is the guide" } });
    fireEvent.change(screen.getByLabelText(/link url/i), { target: { value: "https://example.com/guide" } });
    fireEvent.click(screen.getByRole("button", { name: /save automation/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.method).toBe("POST");
    expect(JSON.parse(String(request.body))).toMatchObject({
      name: "Guide delivery",
      definition: {
        trigger: { type: "comment", match: "keyword", keywords: ["guide", "pdf"] },
        actions: [{ type: "send_link", text: "Here is the guide", url: "https://example.com/guide" }],
      },
    });
  });
});
