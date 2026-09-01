// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DeliveryIssueRow } from "./delivery-issue-row";

const RUSSIAN_REJECTION = "Не удается найти запрошенного пользователя";

afterEach(cleanup);

describe("DeliveryIssueRow", () => {
  it("leads with the human sentence rather than the provider's raw string", () => {
    render(
      <ul>
        <DeliveryIssueRow
          label="Campaign"
          lastError={RUSSIAN_REJECTION}
          timestamp="2026-09-01T11:11:00.000Z"
          timeLabel="1 Sept, 11:11"
        />
      </ul>,
    );

    const summary = screen.getByText(/Meta couldn't find that Instagram user/);
    expect(summary.className).toContain("activity-summary");
    // The untranslated original stays reachable for support without being shown.
    expect(summary.getAttribute("title")).toBe(RUSSIAN_REJECTION);
    expect(screen.queryByText(RUSSIAN_REJECTION)).toBeNull();
  });

  it("puts the kind badge and the timestamp in the meta column", () => {
    render(
      <ul>
        <DeliveryIssueRow
          label="Campaign"
          lastError="socket closed"
          timestamp="2026-09-01T11:11:00.000Z"
          timeLabel="1 Sept, 11:11"
        />
      </ul>,
    );

    const badge = screen.getByText("Campaign");
    expect(badge.className).toContain("failure-badge");
    const time = screen.getByText("1 Sept, 11:11");
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("dateTime")).toBe("2026-09-01T11:11:00.000Z");
  });

  it("renders a state pill only when the caller supplies one", () => {
    const { rerender } = render(
      <ul>
        <DeliveryIssueRow label="Campaign" lastError="socket closed" timestamp="2026-09-01T11:11:00.000Z" timeLabel="1 Sept" />
      </ul>,
    );
    expect(screen.queryByText("Retry pending")).toBeNull();

    rerender(
      <ul>
        <DeliveryIssueRow
          label="Campaign"
          lastError="socket closed"
          timestamp="2026-09-01T11:11:00.000Z"
          timeLabel="1 Sept"
          state="FAILED"
          stateLabel="Retry pending"
        />
      </ul>,
    );
    const pill = screen.getByText("Retry pending");
    expect(pill.className).toContain("failure-state");
    expect(pill.getAttribute("data-state")).toBe("FAILED");
  });

  it("says so plainly when the provider returned no detail", () => {
    render(
      <ul>
        <DeliveryIssueRow label="Lead Webhook" timestamp="2026-09-01T11:11:00.000Z" timeLabel="1 Sept" />
      </ul>,
    );

    expect(screen.getByText("No provider detail was returned.")).toBeTruthy();
  });

  it("shows the supporting detail line when given one", () => {
    render(
      <ul>
        <DeliveryIssueRow
          label="Campaign"
          lastError="socket closed"
          detail="Attempt 2"
          timestamp="2026-09-01T11:11:00.000Z"
          timeLabel="1 Sept"
        />
      </ul>,
    );

    expect(screen.getByText("Attempt 2")).toBeTruthy();
  });
});
