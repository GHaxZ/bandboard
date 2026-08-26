import { describe, it, expect } from "vitest";
import { parseRange } from "./http-range";

describe("parseRange", () => {
  it("returns null for missing or non-bytes header", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("items=0-1", 100)).toBeNull();
  });

  it("parses a full range", () => {
    expect(parseRange("bytes=0-99", 100)).toEqual({ start: 0, end: 99 });
  });

  it("clamps end to totalSize - 1", () => {
    expect(parseRange("bytes=0-999", 100)).toEqual({ start: 0, end: 99 });
  });

  it("parses an open-ended range", () => {
    expect(parseRange("bytes=50-", 100)).toEqual({ start: 50, end: 99 });
  });

  it("parses a suffix range", () => {
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
  });

  it("clamps suffix larger than size", () => {
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
  });

  it("rejects start > end", () => {
    expect(parseRange("bytes=50-10", 100)).toBeNull();
  });

  it("rejects start beyond size", () => {
    expect(parseRange("bytes=100-", 100)).toBeNull();
  });

  it("rejects multi-range requests", () => {
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
  });

  it("rejects malformed suffix", () => {
    expect(parseRange("bytes=-abc", 100)).toBeNull();
  });
});