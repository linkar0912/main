// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { labelIndexes, niceScale, TrendChart } from "./trend-chart";

const days = Array.from({ length: 14 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`);

function renderChart(animate = false) {
  // Deliberately unsorted: the chart owns the chronological order.
  const sent = days.map((day, index) => ({ day, count: index + 1 })).reverse();
  const reached = days.map((day, index) => ({ day, count: index }));
  return render(
    <TrendChart
      label="Daily replies sent and people reached for the last 14 days"
      animate={animate}
      series={[
        { key: "sent", label: "replies sent", points: sent, tone: "primary" },
        { key: "reached", label: "people reached", points: reached, tone: "secondary" },
      ]}
    />,
  );
}

describe("TrendChart", () => {
  afterEach(cleanup);

  it("names the plot and draws one line per series", () => {
    const { container } = renderChart();
    expect(screen.getByRole("img", { name: "Daily replies sent and people reached for the last 14 days" })).toBeTruthy();
    expect(container.querySelectorAll(".trend-line")).toHaveLength(2);
    expect(container.querySelectorAll(".trend-area")).toHaveLength(1);
  });

  it("reads each day aloud from the keyboard, oldest to newest", () => {
    renderChart();
    const plot = screen.getByRole("group", { name: /use the left and right arrow keys/i });
    const readout = document.getElementById(plot.getAttribute("aria-describedby") ?? "");

    fireEvent.focus(plot);
    expect(readout?.textContent).toBe("14 Sept: 14 replies sent, 13 people reached");
    fireEvent.keyDown(plot, { key: "Home" });
    expect(readout?.textContent).toBe("1 Sept: 1 replies sent, 0 people reached");
    fireEvent.keyDown(plot, { key: "ArrowRight" });
    expect(readout?.textContent).toMatch(/^2 Sept: 2 replies sent/);
    expect(document.querySelector(".trend-tooltip")?.textContent).toContain("2 Sept");
    fireEvent.keyDown(plot, { key: "Escape" });
    expect(document.querySelector(".trend-tooltip")).toBeNull();
  });

  it("draws in only when asked to", () => {
    const { container, unmount } = renderChart(true);
    expect(container.querySelector(".trend-chart.is-drawing")).toBeTruthy();
    unmount();
    expect(renderChart(false).container.querySelector(".trend-chart.is-drawing")).toBeNull();
  });
});

describe("chart scale and labels", () => {
  it("rounds the axis up to friendly gridlines", () => {
    expect(niceScale(121)).toEqual({ max: 150, step: 50 });
    expect(niceScale(7)).toEqual({ max: 9, step: 3 });
    expect(niceScale(0)).toEqual({ max: 3, step: 1 });
  });

  it("labels today and evenly spaced days before it", () => {
    expect(labelIndexes(14, 7)).toEqual([1, 3, 5, 7, 9, 11, 13]);
    expect(labelIndexes(30, 6)).toEqual([4, 9, 14, 19, 24, 29]);
    expect(labelIndexes(5, 7)).toEqual([0, 1, 2, 3, 4]);
  });
});
