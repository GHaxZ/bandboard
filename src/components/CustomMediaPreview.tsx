"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CustomPlaybackHUD } from "./CustomPlaybackHUD";
import type { PlaybackEngine } from "@/lib/media-controller";

interface CustomMediaPreviewProps {
  src: string;
  isVideo: boolean;
  coverArtUrl?: string | null;
  label?: string;
}

/**
 * Self-contained player for uploaded video/audio files with the same
 * CustomPlaybackHUD used in practice mode. Mirrors YouTubePreview's structure
 * but for HTML <video>/<audio> elements. No native controls — the HUD overlay
 * provides play/pause/seek/timeline. Standalone (no global store sync).
 */
export function CustomMediaPreview({ src, isVideo, coverArtUrl, label }: CustomMediaPreviewProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Track play/pause via media events (standalone — no global store).
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const engine: PlaybackEngine = useMemo(
    () => ({
      playPause: () => {
        const el = mediaRef.current;
        if (!el) return;
        if (el.paused) el.play().catch(() => {});
        else el.pause();
      },
      seekBy: (delta: number) => {
        const el = mediaRef.current;
        if (!el) return;
        const d = el.duration;
        let t = Math.max(0, el.currentTime + delta);
        if (d && isFinite(d) && t > d) t = d;
        el.currentTime = t;
      },
      seekTo: (time: number) => {
        const el = mediaRef.current;
        if (el) el.currentTime = time;
      },
      getCurrentTime: () => mediaRef.current?.currentTime ?? 0,
      get duration() {
        const d = mediaRef.current?.duration;
        return d && isFinite(d) ? d : 0;
      },
      get isPlaying() {
        return isPlaying;
      },
    }),
    [isPlaying]
  );

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-border bg-black flex items-center justify-center">
      {isVideo ? (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          className="w-full h-full object-contain"
          playsInline
          preload="metadata"
        />
      ) : (
        <>
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={src}
            className="hidden"
          />
          {coverArtUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverArtUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="text-center p-6 text-muted-foreground">
              <p className="text-sm font-semibold text-foreground">{label ?? "Audio track"}</p>
            </div>
          )}
        </>
      )}
      <CustomPlaybackHUD engine={engine} isPlaying={isPlaying} />
    </div>
  );
}
