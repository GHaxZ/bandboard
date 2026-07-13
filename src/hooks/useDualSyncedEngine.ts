"use client";

import { useEffect, useRef } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { YT_SYNC_DRIFT_MS, YT_SYNC_INTERVAL_MS } from "@/lib/constants";
import type { MediaController } from "@/lib/media-controller";

interface UseDualSyncedEngineOpts {
  backing: MediaController | null;
  tab: MediaController | null;
  backingOffset: number;
  tabOffset: number;
}

/**
 * Sync engine operating on two MediaControllers (one per slot: backing, tab).
 * Either slot can be a YouTube IFrame or an uploaded custom
 * <video>/<audio> file.
 *
 * The controllers are constructed by the caller (typically via
 * `useSlotMediaController`) and passed in. The sync interval, offset math and
 * toggle/seek/playPause helpers operate uniformly via the MediaController
 * surface regardless of the underlying media kind.
 */
export function useDualSyncedEngine({
  backing,
  tab,
  backingOffset,
  tabOffset,
}: UseDualSyncedEngineOpts) {
  const activeVideo = usePlayerStore((s) => s.activeVideo);
  const setActiveVideo = usePlayerStore((s) => s.setActiveVideo);
  const registerSeek = usePlayerStore((s) => s.registerSeek);

  // Live offset refs (read inside the interval).
  const offsetsRef = useRef({ backing: backingOffset, tab: tabOffset });
  useEffect(() => {
    offsetsRef.current = { backing: backingOffset, tab: tabOffset };
  }, [backingOffset, tabOffset]);

  const activeVideoRef = useRef(activeVideo);
  useEffect(() => {
    activeVideoRef.current = activeVideo;
  }, [activeVideo]);

  // Keep controller refs fresh so the interval reads latest values without
  // re-subscribing each change.
  const backingRef = useRef(backing);
  const tabRef = useRef(tab);
  useEffect(() => {
    backingRef.current = backing;
  }, [backing]);
  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  // Sync interval: keep the inactive controller muted, time-aligned, and in
  // the same play/pause state as the active one. Reads via refs so a controller
  // created after mount is picked up immediately.
  useEffect(() => {
    const interval = setInterval(() => {
      const backing = backingRef.current;
      const tab = tabRef.current;
      if (!backing || !tab) return;

      const active = activeVideoRef.current === "backing" ? backing : tab;
      const inactive = activeVideoRef.current === "backing" ? tab : backing;

      // Ensure inactive stays muted.
      try {
        inactive.setMuted(true);
      } catch {
        // ignore
      }

      const YT_PLAYING = 1;
      const YT_PAUSED = 2;
      const YT_ENDED = 0;
      const YT_CUED = 5;
      const YT_UNSTARTED = -1;

      let activeState = -1;
      let inactiveState = -1;
      try {
        activeState = active.getState();
        inactiveState = inactive.getState();
      } catch {
        return;
      }

      // Mirror play/pause so both media share one transport state. ENDED is
      // treated as a "should pause the other" state so a slot ending naturally
      // stops the inactive one (matches the original handleEnded behaviour).
      try {
        if (activeState === YT_PLAYING && inactiveState !== YT_PLAYING) {
          inactive.play();
        } else if (
          (activeState === YT_PAUSED ||
            activeState === YT_CUED ||
            activeState === YT_UNSTARTED ||
            activeState === YT_ENDED) &&
          inactiveState === YT_PLAYING
        ) {
          inactive.pause();
        }
      } catch {
        // ignore
      }

      if (activeState !== YT_PLAYING && inactiveState !== YT_PLAYING) return;

      const { backing: bOff, tab: tOff } = offsetsRef.current;
      const activeOffset = activeVideoRef.current === "backing" ? bOff : tOff;
      const inactiveOffset = activeVideoRef.current === "backing" ? tOff : bOff;

      let activeTime = 0;
      let inactiveTime = 0;
      try {
        activeTime = active.getCurrentTime();
        inactiveTime = inactive.getCurrentTime();
      } catch {
        return;
      }
      const expected = activeTime - activeOffset + inactiveOffset;
      if (
        Math.abs(inactiveTime - expected) > YT_SYNC_DRIFT_MS / 1000 &&
        expected >= 0
      ) {
        try {
          inactive.seekTo(expected, true);
        } catch {
          // ignore
        }
      }
    }, YT_SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // --- Imperative helpers (read fresh refs at call-time) ---

  const getActive = () =>
    usePlayerStore.getState().activeVideo === "backing"
      ? backingRef.current
      : tabRef.current;
  const getInactive = () =>
    usePlayerStore.getState().activeVideo === "backing"
      ? tabRef.current
      : backingRef.current;

  const toggleVideo = () => {
    if (!backing || !tab) return;
    const next: "backing" | "tab" =
      activeVideoRef.current === "backing" ? "tab" : "backing";
    const active = getActive();
    const inactive = getInactive();
    if (!active || !inactive) {
      setActiveVideo(next);
      return;
    }

    const { backing: bOff, tab: tOff } = offsetsRef.current;
    const activeOffset = activeVideoRef.current === "backing" ? bOff : tOff;
    const inactiveOffset = activeVideoRef.current === "backing" ? tOff : bOff;

    try {
      const t = active.getCurrentTime();
      const state = active.getState();
      const target = Math.max(0, t - activeOffset + inactiveOffset);
      inactive.seekTo(target, true);
      if (state === 1) inactive.play();
      else if (state === 2) inactive.pause();
      active.setMuted(true);
      inactive.setMuted(false);
    } catch {
      // ignore
    }
    setActiveVideo(next);
  };

  const seekBy = (deltaSeconds: number) => {
    const active = getActive();
    const inactive = getInactive();
    if (!active) return;
    try {
      const baseTime = active.getCurrentTime();
      let target = Math.max(0, baseTime + deltaSeconds);
      const duration = active.getDuration();
      if (duration && target > duration) target = duration;
      registerSeek(target);
      active.seekTo(target, true);
      if (inactive) {
        const { backing: bOff, tab: tOff } = offsetsRef.current;
        const activeOffset =
          usePlayerStore.getState().activeVideo === "backing" ? bOff : tOff;
        const inactiveOffset =
          usePlayerStore.getState().activeVideo === "backing" ? tOff : bOff;
        const expected = target - activeOffset + inactiveOffset;
        if (expected >= 0) inactive.seekTo(expected, true);
      }
    } catch {
      // ignore
    }
  };

  const seekTo = (time: number) => {
    const active = getActive();
    const inactive = getInactive();
    if (!active) return;
    try {
      registerSeek(time);
      active.seekTo(time, true);
      if (inactive) {
        const { backing: bOff, tab: tOff } = offsetsRef.current;
        const activeOffset =
          usePlayerStore.getState().activeVideo === "backing" ? bOff : tOff;
        const inactiveOffset =
          usePlayerStore.getState().activeVideo === "backing" ? tOff : bOff;
        const expected = time - activeOffset + inactiveOffset;
        if (expected >= 0) inactive.seekTo(expected, true);
      }
    } catch {
      // ignore
    }
  };

  const playPause = () => {
    const active = getActive();
    if (!active) return;
    try {
      const state = active.getState();
      if (state === 1) active.pause();
      else active.play();
    } catch {
      // ignore
    }
  };

  const getActiveCurrentTime = (): number => {
    const active = getActive();
    if (!active) return 0;
    try {
      return active.getCurrentTime();
    } catch {
      return 0;
    }
  };

  return {
    toggleVideo,
    seekBy,
    seekTo,
    playPause,
    getActiveCurrentTime,
    hasBoth: !!(backing && tab),
  };
}