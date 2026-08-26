import { describe, it, expect } from "vitest";
import { safeEqual, formatTime, formatTimeLeft, neighborId } from "./utils";

describe("safeEqual", () => {
  it("returns true for equal strings", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(safeEqual("secret", "secrex")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(safeEqual("a", "ab")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("", "a")).toBe(false);
  });
});

describe("formatTime", () => {
  it("formats seconds as MM:SS", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(600)).toBe("10:00");
  });

  it("returns 0:00 for negative or non-finite", () => {
    expect(formatTime(-5)).toBe("0:00");
    expect(formatTime(NaN)).toBe("0:00");
    expect(formatTime(Infinity)).toBe("0:00");
  });
});

describe("formatTimeLeft", () => {
  it("returns null for zero or negative", () => {
    expect(formatTimeLeft(0)).toBeNull();
    expect(formatTimeLeft(-1000)).toBeNull();
  });

  it("returns <1m under a minute", () => {
    expect(formatTimeLeft(30_000)).toBe("<1m");
  });

  it("returns minutes", () => {
    expect(formatTimeLeft(5 * 60_000)).toBe("5m");
  });

  it("returns hours and minutes", () => {
    expect(formatTimeLeft(90 * 60_000)).toBe("1h 30m");
  });

  it("returns days and hours", () => {
    expect(formatTimeLeft(((2 * 24 + 3) * 60) * 60_000)).toBe("2d 3h");
  });
});

describe("neighborId", () => {
  const list = ["a", "b", "c"];
  const get = (x: string) => x;

  it("selects the entry below the removed one", () => {
    expect(neighborId(list, "a", get)).toBe("b");
  });

  it("wraps to the entry above when the last is removed", () => {
    expect(neighborId(list, "c", get)).toBe("b");
  });

  it("returns null for unknown ids and exhausted lists", () => {
    expect(neighborId(list, "z", get)).toBeNull();
    expect(neighborId(["a"], "a", get)).toBeNull();
  });
});
