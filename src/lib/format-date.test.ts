import { describe, expect, it } from "vitest";
import { DATE_LOCALE, formatDate, formatDateParts, formatDateTime, formatMonthDay, formatShortDate, formatTime } from "./format-date";

describe("format-date", () => {
  it("uses the same en-IN day-month order as billing", () => {
    expect(DATE_LOCALE).toBe("en-IN");
    const billing = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date("2026-10-05T12:00:00.000Z"));
    expect(formatDate("2026-10-05T12:00:00.000Z")).toBe(billing);
    expect(formatDate("2026-10-05T12:00:00.000Z")).toMatch(/^5 Oct 2026$/);
  });

  it("pins chart day keys to UTC", () => {
    expect(formatMonthDay("2026-09-01")).toBe("1 Sept");
  });

  it("formats times and short dates in the shared locale", () => {
    const value = "2026-09-01T10:05:00.000Z";
    const date = new Date(value);
    expect(formatTime(value)).toBe(date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }));
    expect(formatShortDate(value)).toBe(date.toLocaleDateString("en-IN", { month: "short", day: "numeric" }));
    expect(formatDateTime(value)).toContain("2026");
    expect(formatDateParts(value, { weekday: "long", timeZone: "UTC" })).toBe("Tuesday");
  });
});
