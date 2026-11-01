import { beforeEach, describe, expect, it } from "vitest";
import { usePlayerStore } from "./player-store";

const state = () => usePlayerStore.getState();

beforeEach(() => {
  usePlayerStore.setState(usePlayerStore.getInitialState(), true);
});

function endSong() {
  state().setCurrentIndex(0);
  state().setPlaying(true);
  state().completeCurrentSong(4, state().playbackId);
  return state().countdownId;
}

describe("setlist playback transitions", () => {
  it("selects a song immediately and discards a running or paused countdown", () => {
    const oldCountdown = endSong();
    state().pauseCountdown(true);
    state().setCurrentIndex(2);

    expect(state()).toMatchObject({
      currentIndex: 2,
      sessionStarted: true,
      finished: false,
      countdown: null,
      countdownPaused: false,
      skipReason: null,
    });
    state().tickCountdown(oldCountdown);
    state().skipCountdown(4, oldCountdown);
    expect(state().currentIndex).toBe(2);
  });

  it("can start from the queue, replay the selected song, and leave the finished screen", () => {
    state().setCurrentIndex(2);
    const firstPlayback = state().playbackId;
    expect(state().sessionStarted).toBe(true);

    state().setCurrentIndex(2);
    expect(state().playbackId).toBeGreaterThan(firstPlayback);
    state().finish();
    state().setCurrentIndex(1);
    expect(state()).toMatchObject({ currentIndex: 1, finished: false, sessionStarted: true });
  });

  it("keeps a manual selection when the previous countdown has already reached zero", () => {
    const oldCountdown = endSong();
    while (state().countdown! > 0) state().tickCountdown(oldCountdown);
    state().setCurrentIndex(2);
    state().skipCountdown(4, oldCountdown);
    expect(state()).toMatchObject({ currentIndex: 2, countdown: null });
  });

  it("invalidates timers and ended callbacks when leaving and entering a session", () => {
    const oldCountdown = endSong();
    const oldPlayback = state().playbackId;
    state().reset();
    state().startCountdown();
    state().tickCountdown(oldCountdown);
    state().skipCountdown(4, oldCountdown);
    state().completeCurrentSong(4, oldPlayback);
    expect(state()).toMatchObject({ currentIndex: 0, sessionStarted: false, countdown: state().transitionTimeout });
  });

  it("cancels auto advance when disabled and starts a fresh countdown when re-enabled after the song ends", () => {
    const oldCountdown = endSong();
    state().tickCountdown(oldCountdown);
    state().setAutoplayEnabled(false);
    expect(state().countdown).toBeNull();

    state().setAutoplayEnabled(true);
    const newCountdown = state().countdownId;
    expect(state().countdown).toBe(state().transitionTimeout);
    state().tickCountdown(oldCountdown);
    state().skipCountdown(4, oldCountdown);
    expect(state().countdown).toBe(state().transitionTimeout);
    expect(state().currentIndex).toBe(0);

    state().skipCountdown(4, newCountdown);
    expect(state().currentIndex).toBe(1);
  });

  it("does not interrupt a playing song or the initial start timer when toggling auto advance", () => {
    state().startCountdown();
    state().setAutoplayEnabled(false);
    expect(state().countdown).toBe(state().transitionTimeout);

    state().setCurrentIndex(1);
    state().setPlaying(true);
    state().setAutoplayEnabled(true);
    expect(state()).toMatchObject({ isPlaying: true, countdown: null, currentIndex: 1 });
  });

  it("ignores ended events from a previous selection and duplicate events from the current song", () => {
    const oldCountdown = endSong();
    const oldPlayback = state().playbackId;
    state().tickCountdown(oldCountdown);
    const remaining = state().countdown;
    state().completeCurrentSong(4, oldPlayback);
    expect(state().countdown).toBe(remaining);

    state().setCurrentIndex(2);
    state().completeCurrentSong(4, oldPlayback);
    expect(state()).toMatchObject({ currentIndex: 2, countdown: null, finished: false });
  });

  it("advances only once and ignores ticks while the countdown is paused", () => {
    const countdownId = endSong();
    state().pauseCountdown(true);
    state().tickCountdown(countdownId);
    expect(state().countdown).toBe(state().transitionTimeout);
    state().pauseCountdown(false);
    state().skipCountdown(4, countdownId);
    state().skipCountdown(4, countdownId);
    expect(state()).toMatchObject({ currentIndex: 1, countdown: null, countdownPaused: false });
  });

  it("cancels a pending transition when the current song resumes or is sought", () => {
    const oldCountdown = endSong();
    state().setPlaying(true);
    state().skipCountdown(4, oldCountdown);
    expect(state()).toMatchObject({ currentIndex: 0, countdown: null, skipReason: null, isPlaying: true });

    state().completeCurrentSong(4, state().playbackId);
    const nextCountdown = state().countdownId;
    state().cancelCountdown();
    state().skipCountdown(4, nextCountdown);
    expect(state()).toMatchObject({ currentIndex: 0, countdown: null, skipReason: null });
  });

  it("starts a fresh initial countdown on restart without inheriting paused state", () => {
    const oldCountdown = endSong();
    state().pauseCountdown(true);
    state().restart();
    state().skipCountdown(4, oldCountdown);
    expect(state()).toMatchObject({
      currentIndex: 0,
      sessionStarted: false,
      finished: false,
      countdown: state().transitionTimeout,
      countdownPaused: false,
    });
    state().skipCountdown(4, state().countdownId);
    expect(state()).toMatchObject({ currentIndex: 0, sessionStarted: true, countdown: null });
  });

  it("finishes on the last song and prevents further automatic transitions", () => {
    state().setCurrentIndex(3);
    state().completeCurrentSong(4, state().playbackId);
    state().startCountdown();
    expect(state()).toMatchObject({ currentIndex: 3, finished: true, isPlaying: false, countdown: null });
  });

  it("waits after a song ends with auto advance off and handles missing media only once", () => {
    state().setAutoplayEnabled(false);
    state().setCurrentIndex(1);
    state().triggerNoVideo();
    state().completeCurrentSong(4, state().playbackId);
    state().triggerNoVideo();
    expect(state()).toMatchObject({ currentIndex: 1, skipReason: "ended", countdown: null });
    state().setAutoplayEnabled(true);
    expect(state().countdown).toBe(state().transitionTimeout);
  });
});
