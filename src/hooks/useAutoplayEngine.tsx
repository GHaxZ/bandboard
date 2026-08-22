"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useYouTubePlayer } from "./useYouTubePlayer";
import { useMultiTrackPlayer } from "./useMultiTrackPlayer";
import { usePlayerStore } from "@/stores/player-store";
import { StemMediaPool } from "@/components/StemMediaPool";
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
  const mutedTrackIds = useMemo(() => {
    if (media.kind !== "multistem") return new Set<string>();
    return new Set(
      media.tracks.filter((t) => t.role === media.mutedRole).map((t) => t.id)
    );
  }, [media]);
  const mt = useMultiTrackPlayer({
    tracks: media.kind === "multistem" ? media.tracks : [],
    mutedTrackIds,
    soloTrackIds: new Set(),
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

  // Custom-file media must also honour the store's volume/speed (previously
  // the sidebar sliders did nothing for uploaded files in rehearsal autoplay).
  const volume = usePlayerStore((s) => s.volume);
  const speed = usePlayerStore((s) => s.speed);
  useEffect(() => {
    const el = customMediaRef.current;
    if (el) el.volume = Math.max(0, Math.min(1, volume / 100));
  }, [volume]);
  useEffect(() => {
    const el = customMediaRef.current;
    if (el) el.playbackRate = speed;
  }, [speed]);

  // Auto-play custom-file when session starts
  useEffect(() => {
    if (media.kind !== "custom-file" || !sessionStarted) return;
    const el = customMediaRef.current;
    if (el && el.paused) el.play().catch(() => {});
  }, [media.kind, sessionStarted]);

  // Multistem end detection. Polls `mt.isEnded()` (set by the player's tick
  // when its stop condition fires) instead of subscribing to `mt.currentT`:
  // that state updates every animation frame, so a dep on it re-ran this
  // effect 60×/sec for the whole playback. The flag also works for stems with
  // unknown DB durations, where `mt.duration` is 0 and a time-based check
  // would never fire.
  const multistemEndedRef = useRef(false);
  useEffect(() => {
    multistemEndedRef.current = false;
  }, [media]);

  useEffect(() => {
    if (media.kind !== "multistem" || !sessionStarted) return;
    const interval = setInterval(() => {
      if (!multistemEndedRef.current && mt.isEnded()) {
        multistemEndedRef.current = true;
        onEndedRef.current?.();
      }
    }, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, sessionStarted]);

  const playPause = () => {
    if (media.kind === "youtube") {
      const p = yt.playerRef?.current;
      if (!p) return;
      try {
        const state = p.getPlayerState();
        // Buffering (3) still counts as "playing" — pausing during a stuck
        // buffer should stop, not restart.
        if (state === 1 || state === 3) p.pauseVideo();
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
        <StemMediaPool
          tracks={media.tracks}
          previewTrack={previewTrack}
          coverArtUrl={coverArtUrl}
          registerRef={mt.registerRef}
          fallbackText="No video tracks. Audio-only playback."
        />
      );
    }
    return null;
  }, [media, customTrack, customRefCallback, mt, coverArtUrl]);

  const seekTo = (target: number) => {
    if (media.kind === "youtube") {
      const p = yt.playerRef?.current;
      if (!p) return;
      try {
        usePlayerStore.getState().registerSeek(target);
        p.seekTo(target, true);
      } catch {
        // ignore
      }
    } else if (media.kind === "custom-file") {
      const el = customMediaRef.current;
      if (!el) return;
      usePlayerStore.getState().registerSeek(target);
      // Clamp against the loaded duration only when it's actually known —
      // before metadata loads, duration is NaN and `NaN || 0` would snap
      // every seek back to 0.
      const d = el.duration;
      const max = isFinite(d) && d > 0 ? d : target;
      el.currentTime = Math.max(0, Math.min(target, max));
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
