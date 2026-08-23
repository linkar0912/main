// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutomationActivity } from "./automation-activity";
import type { ParticipantActivitySummary, ParticipantFunnelSummary } from "./automation-activity";

function stubFetch(data: ParticipantActivitySummary[], summary?: ParticipantFunnelSummary) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ data, summary }) }) as unknown as Response),
  );
}

function participant(overrides: Partial<ParticipantActivitySummary> = {}): ParticipantActivitySummary {
  return {
    id: "participant_1",
    sourceMediaSnapshot: {
      id: "media_1",
      caption: "Giveaway Reel",
      mediaType: "VIDEO",
      mediaProductType: "REELS",
      permalink: "https://www.instagram.com/reel/media_1/",
      timestamp: "2026-08-20T08:00:00.000Z",
    },
    matchedKeyword: "drop",
    state: "FOLLOW_REQUIRED",
    followStatus: undefined,
    followCheckedAt: undefined,
    publicReplyStatus: "SENT",
    publicReplyError: undefined,
    openingStatus: "SENT",
    openingError: undefined,
    finalDeliveryStatus: "SKIPPED",
    finalDeliveryError: undefined,
    finalDeliveredAt: undefined,
    ...overrides,
  };
}

describe("AutomationActivity", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows an empty state when nobody has matched the trigger yet", async () => {
    stubFetch([]);
    render(<AutomationActivity automationId="automation_1" />);

    expect(await screen.findByText(/no activity yet/i)).toBeTruthy();
  });

  it("renders the funnel summary with counts and conversion rates", async () => {
    stubFetch(
      [participant({ state: "LINK_SENT", followStatus: true, finalDeliveryStatus: "SENT" })],
      { commented: 12, openingSent: 9, optedIn: 6, followed: 4, linkSent: 3 },
    );
    render(<AutomationActivity automationId="automation_1" />);

    const funnel = await screen.findByLabelText("Campaign funnel");
    expect(funnel.textContent).toContain("12");
    expect(funnel.textContent).toContain("Commented");
    expect(funnel.textContent).toContain("Got the DM");
    expect(funnel.textContent).toContain("75%");
    expect(funnel.textContent).toContain("Got the link");
    expect(funnel.textContent).toContain("3");
  });

  it("does not render a funnel summary when the server does not return one", async () => {
    stubFetch([participant({ state: "FOLLOW_REQUIRED" })]);
    render(<AutomationActivity automationId="automation_1" />);

    await screen.findByText(/follow required/i);
    expect(screen.queryByLabelText("Campaign funnel")).toBeNull();
  });

  it("renders journey steps and diagnostics for a participant who still needs to follow", async () => {
    stubFetch([
      participant({ state: "FOLLOW_REQUIRED", followStatus: false, followCheckedAt: "2026-08-21T09:00:00.000Z" }),
    ]);
    render(<AutomationActivity automationId="automation_1" />);

    expect(await screen.findByText(/follow required/i)).toBeTruthy();
    expect(screen.getByText(/not following yet/i)).toBeTruthy();
    const journey = screen.getByLabelText("Participant journey");
    expect(journey.textContent).toContain("Opt-in");
    expect(journey.textContent).toContain("Link");
    const link = screen.getByRole("link", { name: /view on instagram/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://www.instagram.com/reel/media_1/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("renders a delivered participant with a completed journey", async () => {
    stubFetch([
      participant({
        state: "LINK_SENT",
        followStatus: true,
        followCheckedAt: "2026-08-21T09:05:00.000Z",
        finalDeliveryStatus: "SENT",
        finalDeliveredAt: "2026-08-21T09:06:00.000Z",
      }),
    ]);
    render(<AutomationActivity automationId="automation_1" />);

    expect(await screen.findByText(/link sent/i)).toBeTruthy();
    expect(screen.getByText(/following · checked/i)).toBeTruthy();
    const deliveredRow = screen.getByText(/view on instagram/i).closest("article");
    expect(deliveredRow?.textContent).toContain("Delivered");
  });

  it("renders an expired participant with the expiry diagnostic", async () => {
    stubFetch([
      participant({
        state: "EXPIRED",
        finalDeliveryStatus: "SKIPPED",
        finalDeliveryError: "Messaging window expired",
      }),
    ]);
    render(<AutomationActivity automationId="automation_1" />);

    expect(await screen.findByText("expired")).toBeTruthy();
    expect(screen.getByText(/messaging window expired/i)).toBeTruthy();
  });

  it("renders a failed participant with the failure diagnostic", async () => {
    stubFetch([
      participant({
        state: "FAILED",
        publicReplyStatus: "FAILED",
        publicReplyError: "Meta rate limit",
      }),
    ]);
    render(<AutomationActivity automationId="automation_1" />);

    expect(await screen.findByText("failed")).toBeTruthy();
    expect(screen.getByText(/meta rate limit/i)).toBeTruthy();
  });

  it("filters the feed with status chips, search, and refresh", async () => {
    stubFetch([
      participant({ state: "LINK_SENT", followStatus: true, finalDeliveryStatus: "SENT" }),
      participant({
        state: "FAILED",
        publicReplyStatus: "FAILED",
        publicReplyError: "Meta rate limit",
        sourceMediaSnapshot: {
          id: "media_2",
          caption: "Broken launch teaser",
          mediaType: "VIDEO",
          mediaProductType: "REELS",
          permalink: "https://www.instagram.com/reel/media_2/",
          timestamp: "2026-08-20T10:00:00.000Z",
        },
      }),
    ]);
    render(<AutomationActivity automationId="automation_1" />);

    expect(await screen.findByText("Giveaway Reel")).toBeTruthy();
    expect(screen.getByText("Broken launch teaser")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /needs attention/i }));
    expect(screen.queryByText("Giveaway Reel")).toBeNull();
    expect(screen.getByText("Broken launch teaser")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^all\b/i }));
    fireEvent.change(screen.getByLabelText("Search participants"), { target: { value: "giveaway" } });
    expect(screen.getByText("Giveaway Reel")).toBeTruthy();
    expect(screen.queryByText("Broken launch teaser")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /refresh activity/i }));
    expect(await screen.findByText("Giveaway Reel")).toBeTruthy();
    expect(screen.getByText(/showing 1 of 2 participants/i)).toBeTruthy();
  });

  it("never renders the media CDN url or thumbnail url, only the permalink", async () => {
    stubFetch([participant({ state: "FOLLOW_REQUIRED" })]);
    const { container } = render(<AutomationActivity automationId="automation_1" />);

    await screen.findByText(/follow required/i);
    expect(container.innerHTML).not.toContain("cdn.example");
    expect(container.querySelectorAll("img").length).toBe(0);
  });
});
