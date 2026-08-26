import { describe, it, expect } from "vitest";
import {
  clamp,
  clampVolume,
  clampPlaybackSpeed,
  validateRehearsal,
  validateSongProgress,
  validatePracticeMarkers,
} from "./validation";

describe("clamp", () => {
  it("clamps within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("clampVolume rounds and bounds 0..100", () => {
    expect(clampVolume(50.4)).toBe(50);
    expect(clampVolume(-5)).toBe(0);
    expect(clampVolume(150)).toBe(100);
  });

  it("clampPlaybackSpeed bounds to 0.5..2.0", () => {
    expect(clampPlaybackSpeed(1)).toBe(1);
    expect(clampPlaybackSpeed(0.1)).toBe(0.5);
    expect(clampPlaybackSpeed(5)).toBe(2);
  });
});

describe("validateRehearsal", () => {
  it("rejects empty title", () => {
    expect(validateRehearsal({ title: "  " })).toBe("title is required");
  });

  it("rejects non-integer date", () => {
    expect(validateRehearsal({ title: "x", date: 1.5 })).toBe(
      "date must be an integer (Unix ms)"
    );
  });

  it("rejects vote without votingEndsAt", () => {
    expect(
      validateRehearsal({ title: "x", date: 1000, type: "vote", songSelectionCount: 3 })
    ).toBe("votingEndsAt must be an integer (Unix ms)");
  });

  it("rejects vote with selection count below minimum", () => {
    expect(
      validateRehearsal({
        title: "x",
        date: 1000,
        type: "vote",
        votingEndsAt: 500,
        songSelectionCount: 0,
      })
    ).toBe("songSelectionCount must be an integer of at least 1");
  });

  it("rejects votingEndsAt after the rehearsal date", () => {
    expect(
      validateRehearsal({
        title: "x",
        date: 1000,
        type: "vote",
        votingEndsAt: 2000,
        songSelectionCount: 3,
      })
    ).toBe("Voting must end before the rehearsal starts");
  });

  it("accepts votingEndsAt at or before the rehearsal date", () => {
    expect(
      validateRehearsal({
        title: "x",
        date: 1000,
        type: "vote",
        votingEndsAt: 1000,
        songSelectionCount: 3,
      })
    ).toBeNull();
  });

  it("ignores votingEndsAt for manual rehearsals", () => {
    expect(
      validateRehearsal({ title: "x", date: 1000, type: "manual", votingEndsAt: 99999 })
    ).toBeNull();
  });
});

describe("validateSongProgress", () => {
  it("rejects unknown status", () => {
    expect(validateSongProgress({ status: "bogus" })).toMatch(/status must be one of/);
  });

  it("rejects out-of-range speed", () => {
    expect(validateSongProgress({ speed: 999 })).toMatch(/speed must be between/);
  });
});

describe("validatePracticeMarkers", () => {
  it("rejects non-array", () => {
    expect(validatePracticeMarkers("nope")).toBe("markers must be an array");
  });

  it("rejects non-finite members", () => {
    expect(validatePracticeMarkers([1, NaN])).toBe("each marker must be a finite number");
  });

  it("accepts a valid marker list", () => {
    expect(validatePracticeMarkers([0, 1.5, 42])).toBeNull();
  });
});