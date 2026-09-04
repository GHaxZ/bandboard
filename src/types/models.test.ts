import { describe, it, expect } from "vitest";
import { resolveMarkers, DEFAULT_PROGRESS } from "./models";

describe("resolveMarkers", () => {
  it("returns the instrument's own set, with legacy fallback", () => {
    const p = {
      ...DEFAULT_PROGRESS,
      practiceMarkers: { rg1: [5, 10], __legacy__: [1, 2] },
    };
    expect(resolveMarkers(p, "rg1")).toEqual([5, 10]);
    expect(resolveMarkers(p, "rg2")).toEqual([1, 2]); // legacy fallback
    expect(resolveMarkers(p, null)).toEqual([1, 2]);
    expect(resolveMarkers(null, "rg1")).toEqual([]);
    expect(resolveMarkers({ ...DEFAULT_PROGRESS }, "rg1")).toEqual([]);
  });
});
