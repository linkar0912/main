// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContactDetailModal } from "./contact-detail-modal";

describe("ContactDetailModal", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the resolved Instagram handle instead of an internal contact id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        contact: {
          id: "contact_fe5f55",
          instagramUsername: "tejastelkar9",
          state: "NONE",
          tags: [],
          score: 0,
          leadStatus: "NEW",
          lastSeenAt: "2026-09-02T08:07:00.000Z",
          createdAt: "2026-08-29T08:07:00.000Z",
        },
        timeline: [],
      },
    }))));

    render(<ContactDetailModal contactId="contact_fe5f55" onClose={() => undefined} />);

    expect(await screen.findByRole("heading", { name: "@tejastelkar9" })).toBeTruthy();
    expect(screen.queryByText("@fe5f55")).toBeNull();
  });
});
