"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useYouTubePlayer } from "./useYouTubePlayer";
import { useMultiTrackPlayer } from "./useMultiTrackPlayer";
import { usePlayerStore } from "@/stores/player-store";
import type { BackingMedia, CustomTrack } from "@/types/models";

interface UseAutoplayEngineOpts {
  media: BackingMedia;
  customTrack?: CustomTrack;
  sessionStarted: boolean;
  onEnded?: () => void;
  coverArtUrl?: string | null;
}

export function useAutoplayEngine({
  media,
  customTrack,
  sessionStarted,
  onEnded,
  coverArtUrl,
}: UseAutoplayEngineOpts) {
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  // Unconditional: YT player always mounted on #autoplay-player-div
  const yt = useYouTubePlayer({
    containerId: "autoplay-player-div",
    videoId: media.kind === "youtube" && sessionStarted ? media.videoId : null,
    startOffset: media.kind === "youtube" ? media.offset : 0,
    onEnded: media.kind === "youtube" ? onEnded : undefined,
    isActive: () => true,
    autoplay: true,
  });

  // Unconditional: multi-stem player with empty tracks when not multistem
  const mt = useMultiTrackPlayer({
    tracks: media.kind === "multistem" ? media.tracks : [],
    mutedTrackIds:
      media.kind === "multistem"
        ? new Set(
            media.tracks
              .filter((t) => t.role === media.mutedRole)
              .map((t) => t.id)
          )
        : new Set(),
    soloTrackIds: new Set(),
    getStreamUrl: (id: string) => `/api/uploads/${id}`,
  });

  // Keep onEnded in a ref for async callbacks
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // Custom-file element management
  const customMediaRef = useRef<HTMLMediaElement | null>(null);

  const customRefCallback = useCallback(
    (el: HTMLMediaElement | null) => {
      customMediaRef.current = el;
      if (el) {
        el.onended = () => onEndedRef.current?.();
        el.onplaying = () => setPlaying(true);
        el.onpause = () => setPlaying(false);
      }
    },
    [setPlaying]
  );

  // Auto-play custom-file when session starts
  useEffect(() => {
    if (media.kind !== "custom-file" || !sessionStarted) return;
    const el = customMediaRef.current;
    if (el && el.paused) el.play().catch(() => {});
  }, [media.kind, sessionStarted]);

  // Multistem end detection
  const multistemEndedRef = useRef(false);
  useEffect(() => {
    multistemEndedRef.current = false;
  }, [media]);

  useEffect(() => {
    if (media.kind !== "multistem" || !sessionStarted) return;
    if (
      mt.duration > 0 &&
      mt.currentT >= mt.duration &&
      !mt.isPlaying &&
      !multistemEndedRef.current
    ) {
      multistemEndedRef.current = true;
      onEndedRef.current?.();
    }
  }, [mt.currentT, mt.duration, mt.isPlaying, media.kind, sessionStarted]);

  const playPause = () => {
    if (media.kind === "youtube") {
      const p = yt.playerRef?.current;
      if (!p) return;
      try {
        if (p.getPlayerState() === 1) p.pauseVideo();
        else p.playVideo();
      } catch {
        // ignore
      }
    } else if (media.kind === "custom-file") {
      const el = customMediaRef.current;
      if (!el) return;
      if (el.paused) el.play().catch(() => {});
      else el.pause();
    } else if (media.kind === "multistem") {
      mt.playPause();
    }
  };

  const seekBy = (deltaSeconds: number) => {
    if (media.kind === "youtube") {
      const p = yt.playerRef?.current;
      if (!p) return;
      try {
        const base = p.getCurrentTime();
        const dur = p.getDuration();
        let target = Math.max(0, base + deltaSeconds);
        if (dur && target > dur) target = dur;
        usePlayerStore.getState().registerSeek(target);
        p.seekTo(target, true);
      } catch {
        // ignore
      }
    } else if (media.kind === "custom-file") {
      const el = customMediaRef.current;
      if (!el) return;
      let target = Math.max(0, el.currentTime + deltaSeconds);
      if (el.duration && target > el.duration) target = el.duration;
      usePlayerStore.getState().registerSeek(target);
      el.currentTime = target;
    } else if (media.kind === "multistem") {
      mt.seekBy(deltaSeconds);
    }
  };

  const renderMedia = useMemo(() => {
    if (media.kind === "custom-file" && customTrack) {
      const src = `/api/uploads/${media.customTrackId}`;
      if (customTrack.isVideo) {
        return (
          <video
            ref={customRefCallback}
            src={src}
            className="w-full h-full aspect-video"
            preload="metadata"
            playsInline
          />
        );
      }
      return (
        <audio
          ref={customRefCallback}
          src={src}
          className="w-full h-full"
          preload="metadata"
        />
      );
    }
    if (media.kind === "multistem") {
      const videoTracks = media.tracks.filter((t) => t.isVideo);
      const previewTrack = videoTracks[0] ?? null;
      return (
        <>
          {previewTrack ? (
            <video
              key={previewTrack.id}
              ref={mt.registerRef(previewTrack.id)}
              src={`/api/uploads/${previewTrack.id}`}
              className="w-full h-full object-contain"
              preload="metadata"
              playsInline
            />
          ) : coverArtUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverArtUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="text-center p-6 text-muted-foreground">
              <p className="text-sm font-semibold text-foreground">
                No video tracks. Audio-only playback.
              </p>
            </div>
          )}
          <div className="hidden">
            {media.tracks
              .filter((t) => t.id !== previewTrack?.id)
              .map((track) =>
                track.isVideo ? (
                  <video
                    key={track.id}
                    ref={mt.registerRef(track.id)}
                    src={`/api/uploads/${track.id}`}
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <audio
                    key={track.id}
                    ref={mt.registerRef(track.id)}
                    src={`/api/uploads/${track.id}`}
                    preload="metadata"
                  />
                )
              )}
          </div>
        </>
      );
    }
    return null;
  }, [media, customTrack, customRefCallback, mt, coverArtUrl]);

  const seekTo = (target: number) => {
    if (media.kind === "youtube") {
      const p = yt.playerRef?.current;
      if (!p) return;
      try {
        p.seekTo(target, true);
      } catch {
        // ignore
      }
    } else if (media.kind === "custom-file") {
      const el = customMediaRef.current;
      if (!el) return;
      el.currentTime = Math.max(0, Math.min(target, el.duration || 0));
    } else if (media.kind === "multistem") {
      mt.seekTo(target);
    }
  };

  const getCurrentTime = (): number => {
    if (media.kind === "youtube") {
      const p = yt.playerRef?.current;
      if (!p) return 0;
      try {
        return p.getCurrentTime() || 0;
      } catch {
        return 0;
      }
    } else if (media.kind === "custom-file") {
      return customMediaRef.current?.currentTime ?? 0;
    } else if (media.kind === "multistem") {
      return mt.currentT;
    }
    return 0;
  };

  const getDuration = (): number => {
    if (media.kind === "youtube") {
      try {
        return yt.playerRef?.current?.getDuration() ?? 0;
      } catch {
        return 0;
      }
    } else if (media.kind === "custom-file") {
      return customMediaRef.current?.duration ?? 0;
    } else if (media.kind === "multistem") {
      return mt.duration;
    }
    return 0;
  };

  return { playPause, seekBy, seekTo, getCurrentTime, getDuration, isPlaying, renderMedia };
}
