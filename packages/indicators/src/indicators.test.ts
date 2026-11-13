import { describe, expect, it } from "vitest";
import { bollinger, crossesAbove, crossesBelow, ema, rsi, sma } from "./index.js";

describe("indicators", () => {
  it("computes SMA with null warm-up", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });

  it("seeds EMA with the SMA and then applies the multiplier", () => {
    const values = ema([1, 2, 3, 4, 5], 3);
    expect(values[0]).toBeNull();
    expect(values[1]).toBeNull();
    expect(values[2]).toBeCloseTo(2);
    expect(values[3]).toBeCloseTo(3);
    expect(values[4]).toBeCloseTo(4);
  });

  it("matches the EMA reference formula on a known series", () => {
    const values = ema([10, 11, 12, 13, 14, 15], 3);
    const k = 2 / 4;
    const seed = (10 + 11 + 12) / 3;
    const expected3 = 13 * k + seed * (1 - k);
    const expected4 = 14 * k + expected3 * (1 - k);
    expect(values[3]).toBeCloseTo(expected3);
    expect(values[4]).toBeCloseTo(expected4);
  });

  it("returns 100 for a strictly rising RSI and 0 for falling", () => {
    const rising = rsi([1, 2, 3, 4, 5, 6, 7], 3);
    const falling = rsi([7, 6, 5, 4, 3, 2, 1], 3);
    expect(rising.at(-1)).toBe(100);
    expect(falling.at(-1)).toBe(0);
  });

  it("returns 50 for a flat RSI series", () => {
    expect(rsi([5, 5, 5, 5, 5, 5], 3).at(-1)).toBe(50);
  });

  it("computes Bollinger population bands", () => {
    const bands = bollinger([1, 2, 3, 4, 5], 5, 2);
    const sigma = Math.sqrt(2);
    expect(bands.middle[4]).toBeCloseTo(3);
    expect(bands.upper[4]).toBeCloseTo(3 + 2 * sigma);
    expect(bands.lower[4]).toBeCloseTo(3 - 2 * sigma);
  });

  it("detects crosses using previous and current values", () => {
    expect(crossesAbove(1, 3, 2, 2)).toBe(true);
    expect(crossesAbove(3, 4, 2, 2)).toBe(false);
    expect(crossesBelow(3, 1, 2, 2)).toBe(true);
    expect(crossesAbove(null, 3, 2, 2)).toBe(false);
  });
});
