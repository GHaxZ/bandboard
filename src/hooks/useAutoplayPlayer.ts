"use client";

import { useEffect, useRef } from "react";
import { useYouTubePlayer } from "./useYouTubePlayer";
import { usePlayerStore } from "@/stores/player-store";

interface UseAutoplayPlayerOpts {
  videoId: string | null;
  startOffset: number;
  sessionStarted: boolean;
  /** Called when the active player ends. */
  onEnded?: () => void;
}

/**
 * Single-player hook for Rehearsal Autoplay (PLAN §9.5). Drives the store's
 * session lifecycle via the `onEnded` callback handed in by the page.
 */
export function useAutoplayPlayer({
  videoId,
  startOffset,
  sessionStarted,
  onEnded,
}: UseAutoplayPlayerOpts) {
  const playerRefHolder = useRef<ReturnType<typeof useYouTubePlayer>["playerRef"]["current"]>(null);

  const { playerRef } = useYouTubePlayer({
    containerId: "autoplay-player-div",
    videoId: sessionStarted ? videoId : null,
    startOffset,
    onEnded,
    isActive: () => true,
  });

  useEffect(() => {
    playerRefHolder.current = playerRef.current;
  }, [playerRef]);

  const playPause = () => {
    const p = playerRefHolder.current;
    if (!p) return;
    try {
      const state = p.getPlayerState();
      if (state === 1) p.pauseVideo();
      else p.playVideo();
    } catch {
      // ignore
    }
  };

  const seekBy = (deltaSeconds: number) => {
    const p = playerRefHolder.current;
    if (!p) return;
    try {
      const base = p.getCurrentTime();
      let target = Math.max(0, base + deltaSeconds);
      const duration = p.getDuration();
      if (duration && target > duration) target = duration;
      usePlayerStore.getState().registerSeek(target);
      p.seekTo(target, true);
    } catch {
      // ignore
    }
  };

  return { playPause, seekBy };
}
