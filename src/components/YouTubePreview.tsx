"use client";

import { useState, useEffect, useMemo, useId } from "react";
import { useYouTubePlayer } from "@/hooks/useYouTubePlayer";
import { CustomPlaybackHUD } from "./CustomPlaybackHUD";
import type { PlaybackEngine } from "@/lib/media-controller";

interface YouTubePreviewProps {
  videoId: string;
}

/**
 * Self-contained YouTube player with the same CustomPlaybackHUD used in
 * practice mode. Replaces plain <iframe> embeds in the song dashboard.
 * Each instance has its own play/pause state and does not sync to the
 * global player store (isActive = false).
 */
export function YouTubePreview({ videoId }: YouTubePreviewProps) {
  const reactId = useId();
  const containerId = `yt-preview-${reactId}`;
  const [isPlaying, setIsPlaying] = useState(false);

  const { playerRef } = useYouTubePlayer({
    containerId,
    videoId,
    startOffset: 0,
    isActive: () => false, // don't sync to global player store
  });

  // Poll YT player state for isPlaying (functional update prevents re-renders
  // when the value hasn't changed).
  useEffect(() => {
    let raf: number;
    const tick = () => {
      const p = playerRef.current;
      if (p) {
        try {
          const state = p.getPlayerState();
          const playing = state === 1;
          setIsPlaying((prev) => (prev === playing ? prev : playing));
        } catch {
          // ignore
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playerRef]);

  const engine: PlaybackEngine = useMemo(
    () => ({
      playPause: () => {
        const p = playerRef.current;
        if (!p) return;
        try {
          if (p.getPlayerState() === 1) p.pauseVideo();
          else p.playVideo();
        } catch {
          // ignore
        }
      },
      seekBy: (delta: number) => {
        const p = playerRef.current;
        if (!p) return;
        try {
          const t = p.getCurrentTime();
          const d = p.getDuration();
          let target = Math.max(0, t + delta);
          if (d && target > d) target = d;
          p.seekTo(target, true);
        } catch {
          // ignore
        }
      },
      seekTo: (time: number) => {
        const p = playerRef.current;
        if (!p) return;
        try {
          p.seekTo(time, true);
        } catch {
          // ignore
        }
      },
      getCurrentTime: () => {
        try {
          return playerRef.current?.getCurrentTime() ?? 0;
        } catch {
          return 0;
        }
      },
      get duration() {
        try {
          return playerRef.current?.getDuration() ?? 0;
        } catch {
          return 0;
        }
      },
      get isPlaying() {
        return isPlaying;
      },
    }),
    [playerRef, isPlaying]
  );

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-border bg-black">
      <div id={containerId} className="w-full h-full" />
      <CustomPlaybackHUD engine={engine} isPlaying={isPlaying} />
    </div>
  );
}
