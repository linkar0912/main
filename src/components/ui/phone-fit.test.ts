import { describe, expect, it } from "vitest";
import { PHONE_DESIGN_HEIGHT, PHONE_DESIGN_WIDTH, READABLE_ZOOM, phoneZoom } from "./phone-fit";

describe("phoneZoom", () => {
  it("lays the device out with an iPhone's 393:852 screen inside an 18px bezel", () => {
    expect(PHONE_DESIGN_WIDTH).toBe(318);
    expect((PHONE_DESIGN_HEIGHT - 18) / (PHONE_DESIGN_WIDTH - 18)).toBeCloseTo(852 / 393, 2);
  });

  it("never grows the phone past its design size", () => {
    expect(phoneZoom(1000, 2000)).toBe(1);
  });

  it("scales evenly to the tighter of width and height, so the shape never changes", () => {
    expect(phoneZoom(PHONE_DESIGN_WIDTH, PHONE_DESIGN_HEIGHT / 2)).toBe(0.5);
    expect(phoneZoom(PHONE_DESIGN_WIDTH * 0.8, 2000)).toBe(0.8);
    expect(phoneZoom(PHONE_DESIGN_WIDTH * 0.9, PHONE_DESIGN_HEIGHT * 0.7)).toBe(0.7);
  });

  it("stays readable on very short windows and ignores unmeasured layouts", () => {
    expect(phoneZoom(100, 100)).toBe(0.5);
    expect(phoneZoom(0, 500)).toBe(1);
  });

  it("keeps the laptop side-column phone readable on short windows (the column scrolls instead)", () => {
    expect(READABLE_ZOOM).toBeGreaterThanOrEqual(0.85);
    // 1470x745: about 0.73 of the height is free; the text must not shrink with it.
    expect(phoneZoom(360, PHONE_DESIGN_HEIGHT * 0.73, READABLE_ZOOM)).toBe(READABLE_ZOOM);
    // Room to spare: the floor changes nothing.
    expect(phoneZoom(360, PHONE_DESIGN_HEIGHT * 0.95, READABLE_ZOOM)).toBe(0.95);
    // A narrow column still wins, so the phone never overflows sideways.
    expect(phoneZoom(PHONE_DESIGN_WIDTH * 0.8, 200, READABLE_ZOOM)).toBe(0.8);
  });
});
