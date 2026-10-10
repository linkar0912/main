import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("csvCell", () => {
  it("neutralizes every formula trigger character", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=1")).toBe("'\t=1");
    expect(csvCell("\r=1")).toBe("\"'\r=1\"");
  });

  it("quotes values with separators, quotes or line breaks", () => {
    expect(csvCell("a,b")).toBe("\"a,b\"");
    expect(csvCell("say \"hi\"")).toBe("\"say \"\"hi\"\"\"");
    expect(csvCell("line\nbreak")).toBe("\"line\nbreak\"");
    expect(csvCell("line\r\nbreak")).toBe("\"line\r\nbreak\"");
  });

  it("leaves ordinary values untouched and blanks missing ones", () => {
    expect(csvCell("contact_1")).toBe("contact_1");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(null)).toBe("");
    expect(csvCell(4)).toBe("4");
  });
});
