import { create } from "zustand";
import { AUTOPLAY_TIMEOUT_DEFAULT } from "@/lib/constants";

// Minimal YT.Player type — the real shape is injected at runtime by the IFrame API.
export type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allow: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  setVolume: (v: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setPlaybackRate: (r: number) => void;
  loadVideoById: (arg: string | { videoId: string; startSeconds?: number }) => void;
  destroy: () => void;
};

export type ActiveVideo = "backing" | "tab";
export type SkipReason = "ended" | "no_video" | "manual" | null;

interface PlayerStore {
  // shared playback
  isPlaying: boolean;
  volume: number;
  speed: number;
  lastSeekAt: number;

  // practice (dual player)
  activeVideo: ActiveVideo;
  markers: number[];

  // autoplay
  currentIndex: number;
  /** Changes on every selection, including replaying the same queue entry. */
  playbackId: number;
  /** Invalidates callbacks belonging to a canceled or replaced countdown. */
  countdownId: number;
  autoplayEnabled: boolean;
  transitionTimeout: number;
  countdown: number | null;
  countdownPaused: boolean;
  sessionStarted: boolean;
  finished: boolean;
  skipReason: SkipReason;

  // actions
  setPlaying: (v: boolean) => void;
  setVolume: (v: number) => void;
  setSpeed: (v: number) => void;
  registerSeek: () => void;

  setActiveVideo: (v: ActiveVideo) => void;
  setMarkers: (m: number[]) => void;

  setCurrentIndex: (i: number) => void;
  setAutoplayEnabled: (v: boolean) => void;
  setTransitionTimeout: (n: number) => void;

  startCountdown: () => void;
  cancelCountdown: () => void;
  tickCountdown: (countdownId: number) => void;
  pauseCountdown: (v: boolean) => void;
  skipCountdown: (len: number, countdownId: number) => void;
  completeCurrentSong: (len: number, playbackId: number) => void;
  startSession: () => void;
  finish: () => void;
  restart: () => void;
  triggerNoVideo: () => void;
  clearSkipReason: () => void;

  reset: () => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  isPlaying: false,
  volume: 100,
  speed: 1.0,
  lastSeekAt: 0,

  activeVideo: "backing",
  markers: [],

  currentIndex: 0,
  playbackId: 0,
  countdownId: 0,
  autoplayEnabled: true,
  transitionTimeout: AUTOPLAY_TIMEOUT_DEFAULT,
  countdown: null,
  countdownPaused: false,
  sessionStarted: false,
  finished: false,
  skipReason: null,

  setPlaying: (v) => set((s) => ({
    isPlaying: v,
    // Resuming the current song supersedes its pending auto advance.
    ...(v ? {
      countdown: null,
      countdownPaused: false,
      countdownId: s.countdown === null ? s.countdownId : s.countdownId + 1,
      skipReason: null,
      finished: false,
    } : {}),
  })),
  setVolume: (v) => set({ volume: v }),
  setSpeed: (v) => set({ speed: v }),
  // seekTarget was removed as dead state; only the timestamp is kept so the
  // sync engine can debounce seeks.
  registerSeek: () => set({ lastSeekAt: Date.now() }),

  setActiveVideo: (v) => set({ activeVideo: v }),
  setMarkers: (m) => set({ markers: m }),

  setCurrentIndex: (i) => set((s) => ({
    currentIndex: i,
    playbackId: s.playbackId + 1,
    countdownId: s.countdownId + 1,
    sessionStarted: true,
    finished: false,
    countdown: null,
    countdownPaused: false,
    skipReason: null,
    isPlaying: false,
  })),
  setAutoplayEnabled: (v) => set((s) => ({
    autoplayEnabled: v,
    // Auto advance controls transitions between songs, not the initial start.
    ...(!v && s.sessionStarted ? {
      countdown: null,
      countdownPaused: false,
      countdownId: s.countdownId + 1,
    } : {}),
    ...(v && !s.autoplayEnabled && s.sessionStarted && !s.finished && s.skipReason === "ended" ? {
      countdown: s.transitionTimeout,
      countdownPaused: false,
      countdownId: s.countdownId + 1,
    } : {}),
  })),
  setTransitionTimeout: (n) => set({ transitionTimeout: n }),

  startCountdown: () =>
    set((s) => s.finished || s.countdown !== null || (s.sessionStarted && !s.autoplayEnabled) ? {} : ({
      countdown: s.transitionTimeout,
      countdownId: s.countdownId + 1,
      countdownPaused: false,
      isPlaying: false,
      skipReason: s.sessionStarted ? "ended" : null,
    })),
  cancelCountdown: () => set((s) => ({
    countdown: null,
    countdownPaused: false,
    countdownId: s.countdownId + 1,
    skipReason: null,
  })),
  tickCountdown: (countdownId) =>
    set((s) => (s.countdownId !== countdownId || s.countdown === null || s.countdownPaused || s.finished
      ? {} : { countdown: Math.max(0, s.countdown - 1) })),
  pauseCountdown: (v) => set((s) => s.countdown === null ? {} : { countdownPaused: v }),
  skipCountdown: (len, countdownId) =>
    set((s) => {
      if (s.countdown === null || s.countdownId !== countdownId || s.finished) return {};
      return {
        currentIndex: s.sessionStarted ? Math.min(s.currentIndex + 1, Math.max(0, len - 1)) : s.currentIndex,
        playbackId: s.playbackId + 1,
        countdownId: s.countdownId + 1,
        sessionStarted: true,
        finished: len === 0,
        countdown: null,
        countdownPaused: false,
        skipReason: null,
        isPlaying: false,
      };
    }),
  completeCurrentSong: (len, playbackId) => set((s) => {
    if (s.playbackId !== playbackId || !s.sessionStarted || s.finished || s.skipReason === "ended") return {};
    const finished = s.currentIndex >= len - 1;
    return {
      finished,
      isPlaying: false,
      skipReason: "ended",
      countdown: !finished && s.autoplayEnabled ? s.transitionTimeout : null,
      countdownPaused: false,
      countdownId: s.countdownId + 1,
    };
  }),
  startSession: () => set((s) => ({
    sessionStarted: true,
    finished: false,
    playbackId: s.playbackId + 1,
    countdownId: s.countdownId + 1,
    countdown: null,
    countdownPaused: false,
    skipReason: null,
  })),
  finish: () => set((s) => ({
    finished: true,
    isPlaying: false,
    countdown: null,
    countdownPaused: false,
    countdownId: s.countdownId + 1,
  })),
  restart: () =>
    set((s) => ({
      currentIndex: 0,
      playbackId: s.playbackId + 1,
      countdownId: s.countdownId + 1,
      finished: false,
      sessionStarted: false,
      countdown: s.transitionTimeout,
      countdownPaused: false,
      isPlaying: false,
      skipReason: null,
    })),
  triggerNoVideo: () => set((s) => !s.sessionStarted || s.finished || s.countdown !== null || s.skipReason === "ended"
    ? {} : { skipReason: "no_video", isPlaying: false }),
  clearSkipReason: () => set({ skipReason: null }),

  // NOTE: reset() deliberately does NOT touch volume/speed/autoplayEnabled/
  // transitionTimeout — those persist across practice sessions.
  reset: () =>
    set((s) => ({
      isPlaying: false,
      activeVideo: "backing",
      markers: [],
      currentIndex: 0,
      playbackId: s.playbackId + 1,
      countdownId: s.countdownId + 1,
      countdown: null,
      countdownPaused: false,
      sessionStarted: false,
      finished: false,
      skipReason: null,
    })),
}));
