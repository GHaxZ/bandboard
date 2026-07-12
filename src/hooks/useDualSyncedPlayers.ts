"use client";

import { useEffect, useRef } from "react";
import { useYouTubePlayer } from "./useYouTubePlayer";
import { usePlayerStore } from "@/stores/player-store";
import { YT_SYNC_DRIFT_MS, YT_SYNC_INTERVAL_MS } from "@/lib/constants";

interface UseDualSyncedPlayersOpts {
  backingId: string | null;
  tabId: string | null;
  backingOffset: number;
  tabOffset: number;
}

/**
 * Spawns two `useYouTubePlayer` instances and keeps the inactive one muted and
 * aligned in time (PLAN §9.4). Exposes imperative helpers used by the
 * keyboard shortcuts and on-screen controls.
 *
 * The YT player objects live on each hook's stable `playerRef` (a `useRef`
 * object whose identity never changes, only `.current` updates once the IFrame
 * API instantiates the player). We read `.current` at call-time everywhere
 * instead of caching into local refs — a local mirror would need a dependency
 * that actually changes, and the ref object identity is stable.
 */
export function useDualSyncedPlayers({
  backingId,
  tabId,
  backingOffset,
  tabOffset,
}: UseDualSyncedPlayersOpts) {
  const activeVideo = usePlayerStore((s) => s.activeVideo);
  const setActiveVideo = usePlayerStore((s) => s.setActiveVideo);
  const registerSeek = usePlayerStore((s) => s.registerSeek);
  const setPlaying = usePlayerStore((s) => s.setPlaying);

  // Live offset refs (read inside the interval).
  const offsetsRef = useRef({ backing: backingOffset, tab: tabOffset });
  useEffect(() => {
    offsetsRef.current = { backing: backingOffset, tab: tabOffset };
  }, [backingOffset, tabOffset]);

  const activeVideoRef = useRef(activeVideo);
  useEffect(() => {
    activeVideoRef.current = activeVideo;
  }, [activeVideo]);

  // When either player ends naturally, pause the other and clear isPlaying so
  // the two videos finish in lock-step.
  const handleEnded = () => {
    try {
      const b = backingHook.playerRef.current;
      if (b && typeof b.getPlayerState === "function" && b.getPlayerState() === 1) b.pauseVideo();
    } catch {
      // ignore
    }
    try {
      const t = tabHook.playerRef.current;
      if (t && typeof t.getPlayerState === "function" && t.getPlayerState() === 1) t.pauseVideo();
    } catch {
      // ignore
    }
    setPlaying(false);
  };

  const backingHook = useYouTubePlayer({
    containerId: "backing-player-div",
    videoId: backingId,
    startOffset: backingOffset,
    onEnded: handleEnded,
    isActive: () => activeVideoRef.current === "backing",
  });
  const tabHook = useYouTubePlayer({
    containerId: "tab-player-div",
    videoId: tabId,
    startOffset: tabOffset,
    onEnded: handleEnded,
    isActive: () => activeVideoRef.current === "tab",
  });

  // Sync interval: keep the inactive player muted, time-aligned, and in the
  // same play/pause state as the active one. Reads `.current` each tick so a
  // player created after mount is picked up immediately.
  useEffect(() => {
    const interval = setInterval(() => {
      const backing = backingHook.playerRef.current;
      const tab = tabHook.playerRef.current;
      if (!backing || !tab) return;
      if (typeof backing.getPlayerState !== "function") return;
      if (typeof tab.getPlayerState !== "function") return;

      const active = activeVideoRef.current === "backing" ? backing : tab;
      const inactive = activeVideoRef.current === "backing" ? tab : backing;

      // Ensure inactive stays muted.
      try {
        if (typeof inactive.isMuted === "function" && !inactive.isMuted()) inactive.mute();
      } catch {
        // ignore
      }

      const YT_PLAYING = 1;
      const YT_PAUSED = 2;
      let activeState = -1;
      let inactiveState = -1;
      try {
        activeState = active.getPlayerState();
        inactiveState = inactive.getPlayerState();
      } catch {
        return;
      }

      // Mirror play/pause so both videos share one transport state.
      try {
        if (activeState === YT_PLAYING && inactiveState !== YT_PLAYING) {
          inactive.playVideo();
        } else if (
          (activeState === YT_PAUSED || activeState === 5 || activeState === -1) &&
          inactiveState === YT_PLAYING
        ) {
          inactive.pauseVideo();
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
      if (Math.abs(inactiveTime - expected) > YT_SYNC_DRIFT_MS / 1000 && expected >= 0) {
        try {
          inactive.seekTo(expected, true);
        } catch {
          // ignore
        }
      }
    }, YT_SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Imperative helpers (read fresh `.current` at call-time) ----------------

  const getActive = () =>
    usePlayerStore.getState().activeVideo === "backing"
      ? backingHook.playerRef.current
      : tabHook.playerRef.current;
  const getInactive = () =>
    usePlayerStore.getState().activeVideo === "backing"
      ? tabHook.playerRef.current
      : backingHook.playerRef.current;

  const toggleVideo = () => {
    if (!backingId || !tabId) return;
    const next: "backing" | "tab" = activeVideoRef.current === "backing" ? "tab" : "backing";
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
      const state = active.getPlayerState();
      const target = Math.max(0, t - activeOffset + inactiveOffset);
      inactive.seekTo(target, true);
      if (state === 1) inactive.playVideo();
      else if (state === 2) inactive.pauseVideo();
      active.mute();
      inactive.unMute();
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
        const activeOffset = usePlayerStore.getState().activeVideo === "backing" ? bOff : tOff;
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
        const activeOffset = usePlayerStore.getState().activeVideo === "backing" ? bOff : tOff;
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
      const state = active.getPlayerState();
      if (state === 1) active.pauseVideo();
      else active.playVideo();
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
    backingReady: !!backingId,
    tabReady: !!tabId,
    hasBoth: !!(backingId && tabId),
  };
}