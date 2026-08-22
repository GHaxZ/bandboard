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
  registerSeek: (target: number) => void;

  setActiveVideo: (v: ActiveVideo) => void;
  setMarkers: (m: number[]) => void;

  setCurrentIndex: (i: number) => void;
  setAutoplayEnabled: (v: boolean) => void;
  setTransitionTimeout: (n: number) => void;

  startCountdown: () => void;
  tickCountdown: () => void;
  pauseCountdown: (v: boolean) => void;
  skipCountdown: (len: number) => void;
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
  autoplayEnabled: true,
  transitionTimeout: AUTOPLAY_TIMEOUT_DEFAULT,
  countdown: null,
  countdownPaused: false,
  sessionStarted: false,
  finished: false,
  skipReason: null,

  setPlaying: (v) => set({ isPlaying: v }),
  setVolume: (v) => set({ volume: v }),
  setSpeed: (v) => set({ speed: v }),
  // seekTarget was removed as dead state; only the timestamp is kept so the
  // sync engine can debounce seeks.
  registerSeek: (_target) => set({ lastSeekAt: Date.now() }),

  setActiveVideo: (v) => set({ activeVideo: v }),
  setMarkers: (m) => set({ markers: m }),

  setCurrentIndex: (i) => set({ currentIndex: i, skipReason: null, isPlaying: false }),
  setAutoplayEnabled: (v) => set({ autoplayEnabled: v }),
  setTransitionTimeout: (n) => set({ transitionTimeout: n }),

  startCountdown: () =>
    set((s) => ({
      countdown: s.transitionTimeout,
      countdownPaused: false,
      skipReason: s.skipReason === "no_video" ? s.skipReason : "ended",
    })),
  tickCountdown: () =>
    set((s) => (s.countdown === null ? {} : { countdown: Math.max(0, s.countdown - 1) })),
  pauseCountdown: (v) => set({ countdownPaused: v }),
  skipCountdown: (len) =>
    set((s) => {
      if (!s.sessionStarted) {
        return { sessionStarted: true, countdown: null, skipReason: null };
      }
      return {
        currentIndex: Math.min(s.currentIndex + 1, Math.max(0, len - 1)),
        countdown: null,
        skipReason: null,
        isPlaying: false,
      };
    }),
  startSession: () => set({ sessionStarted: true, countdown: null, skipReason: null }),
  finish: () => set({ finished: true, isPlaying: false, countdown: null }),
  restart: () =>
    set({
      currentIndex: 0,
      finished: false,
      sessionStarted: false,
      countdown: null,
      isPlaying: false,
      skipReason: null,
    }),
  triggerNoVideo: () => set({ skipReason: "no_video", isPlaying: false }),
  clearSkipReason: () => set({ skipReason: null }),

  // NOTE: reset() deliberately does NOT touch volume/speed/autoplayEnabled/
  // transitionTimeout — those persist across practice sessions.
  reset: () =>
    set({
      isPlaying: false,
      activeVideo: "backing",
      markers: [],
      currentIndex: 0,
      countdown: null,
      countdownPaused: false,
      sessionStarted: false,
      finished: false,
      skipReason: null,
    }),
}));
