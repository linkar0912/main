// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReplyVolumeChart } from "./reply-volume-chart";

describe("ReplyVolumeChart", () => {
  afterEach(cleanup);

  it("normalizes both series into one chronological, accessible chart", () => {
    const { container } = render(
      <ReplyVolumeChart
        days={14}
        sent={[{ day: "2026-09-02", count: 4 }, { day: "2026-09-01", count: 2 }]}
        reached={[{ day: "2026-09-03", count: 3 }, { day: "2026-09-01", count: 1 }]}
      />,
    );

    const chart = screen.getByRole("img", { name: "Daily replies sent and people reached for the last 14 days" });
    const legend = screen.getByLabelText("Chart legend");
    expect(within(legend).getByText("Replies sent")).toBeTruthy();
    expect(within(legend).getByText("People reached")).toBeTruthy();
    const columns = [...chart.querySelectorAll<HTMLElement>(".chart-column")];
    expect(columns.map((column) => column.title)).toEqual([
      "1 Sept: 2 sent, 1 reached",
      "2 Sept: 4 sent, 0 reached",
      "3 Sept: 0 sent, 3 reached",
    ]);
    expect(container.querySelectorAll(".chart-bar")).toHaveLength(6);
  });

  it("shows a helpful empty state instead of zero-height bars", () => {
    render(<ReplyVolumeChart days={14} sent={[{ day: "2026-09-01", count: 0 }]} reached={[]} compact />);

    expect(screen.getByText("No replies yet in the last 14 days. Daily activity shows up here once an automation sends its first reply.")).toBeTruthy();
    expect(screen.queryByLabelText("Chart legend")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
