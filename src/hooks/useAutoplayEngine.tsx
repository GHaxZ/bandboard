"use client";

import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { useYouTubePlayer } from "./useYouTubePlayer";
import { useMultiTrackPlayer } from "./useMultiTrackPlayer";
import { useMediaStoreSync } from "./useMediaStoreSync";
import { usePlayerStore } from "@/stores/player-store";
import { StemMediaPool } from "@/components/StemMediaPool";
import { togglePlayPause } from "@/lib/media-controller";
import { trackIdsWithRole } from "@/types/models";
import type { BackingMedia, CustomTrack } from "@/types/models";

interface UseAutoplayEngineOpts {
  media: BackingMedia;
  customTrack?: CustomTrack;
  sessionStarted: boolean;
  playbackId: number;
  onEnded?: () => void;
  coverArtUrl?: string | null;
}

export function useAutoplayEngine({
  media,
  customTrack,
  sessionStarted,
  playbackId,
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
    playbackKey: playbackId,
    onEnded: media.kind === "youtube" ? onEnded : undefined,
    isActive: () => {
      const state = usePlayerStore.getState();
      return state.playbackId === playbackId && state.sessionStarted && !state.finished;
    },
    autoplay: true,
  });

  // Unconditional: multi-stem player with empty tracks when not multistem
  const mutedTrackIds = useMemo(() => {
    if (media.kind !== "multistem") return new Set<string>();
    return trackIdsWithRole(media.tracks, media.mutedRole);
  }, [media]);
  const mt = useMultiTrackPlayer({
    tracks: media.kind === "multistem" ? media.tracks : [],
    mutedTrackIds,
    soloTrackIds: new Set(),
    playbackKey: playbackId,
  });

  // Keep onEnded in a ref for async callbacks
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // Custom-file element management. `customEl` is a state mirror of the ref so
  // the volume/speed sync re-applies when React swaps the element instance.
  const customMediaRef = useRef<HTMLMediaElement | null>(null);
  const [customEl, setCustomEl] = useState<HTMLMediaElement | null>(null);

  const customRefCallback = useCallback(
    (el: HTMLMediaElement | null) => {
      const previous = customMediaRef.current;
      if (previous && previous !== el) {
        previous.onended = null;
        previous.onplaying = null;
        previous.onpause = null;
        previous.pause();
      }
      customMediaRef.current = el;
      setCustomEl(el);
      if (el) {
        const isCurrent = () => {
          const state = usePlayerStore.getState();
          return customMediaRef.current === el && state.playbackId === playbackId && !state.finished;
        };
        el.onended = () => { if (isCurrent()) onEndedRef.current?.(); };
        el.onplaying = () => { if (isCurrent()) setPlaying(true); };
        el.onpause = () => { if (isCurrent()) setPlaying(false); };
      }
    },
    [playbackId, setPlaying]
  );

  // Custom-file media must also honour the store's volume/speed (previously
  // the sidebar sliders did nothing for uploaded files in rehearsal autoplay).
  useMediaStoreSync(() => [customEl], [customEl]);

  const mediaCustomTrackId = media.kind === "custom-file" ? media.customTrackId : null;
  const mediaCustomOffset = media.kind === "custom-file" ? media.offset : 0;
  // Auto-play custom-file when session starts
  useEffect(() => {
    if (media.kind !== "custom-file" || !sessionStarted) return;
    const el = customMediaRef.current;
    if (!el) return;
    el.currentTime = mediaCustomOffset;
    if (el.paused) el.play().catch(() => {});
  }, [media.kind, mediaCustomTrackId, mediaCustomOffset, customEl, sessionStarted, playbackId]);

  // Multistem end detection. Polls `mt.isEnded()` (set by the player's tick
  // when its stop condition fires) instead of subscribing to `mt.currentT`:
  // that state updates every animation frame, so a dep on it re-ran this
  // effect 60×/sec for the whole playback. The flag also works for stems with
  // unknown DB durations, where `mt.duration` is 0 and a time-based check
  // would never fire.
  const multistemEndedRef = useRef(false);
  // Use track IDs so refreshing song data or changing instruments doesn't
  // reset the end latch or restart a paused song. A new selection always does.
  const mediaTracks = media.kind === "multistem" ? media.tracks : null;
  const mediaTracksKey = mediaTracks?.map((track) => track.id).join(",") ?? "";
  const isMultistemEnded = mt.isEnded;
  useEffect(() => {
    multistemEndedRef.current = false;
  }, [mediaTracksKey, playbackId]);

  useEffect(() => {
    if (media.kind === "multistem" && sessionStarted) setPlaying(true);
  }, [media.kind, mediaTracksKey, playbackId, sessionStarted, setPlaying]);

  useEffect(() => {
    if (media.kind !== "multistem" || !sessionStarted) return;
    const interval = setInterval(() => {
      if (usePlayerStore.getState().playbackId !== playbackId) return;
      if (!isMultistemEnded()) {
        multistemEndedRef.current = false;
      } else if (!multistemEndedRef.current) {
        multistemEndedRef.current = true;
        onEndedRef.current?.();
      }
    }, 250);
    return () => clearInterval(interval);
  }, [media.kind, playbackId, sessionStarted, isMultistemEnded]);

  const playPause = () => {
    if (!sessionStarted) return;
    if (media.kind === "youtube") {
      const p = yt.playerRef?.current;
      if (!p) return;
      try {
        togglePlayPause({
          getState: () => p.getPlayerState(),
          play: () => p.playVideo(),
          pause: () => p.pauseVideo(),
        });
      } catch {
        // ignore
      }
    } else if (media.kind === "custom-file") {
      const el = customMediaRef.current;
      if (!el) return;
      if (el.paused) el.play().catch(() => {});
      else el.pause();
    } else if (media.kind === "multistem") {
      if (mt.isEnded()) mt.seekTo(0);
      mt.playPause();
    }
  };

  const seekBy = (deltaSeconds: number) => {
    if (!sessionStarted || media.kind === "none") return;
    usePlayerStore.getState().cancelCountdown();
    if (media.kind === "youtube") {
      const p = yt.playerRef?.current;
      if (!p) return;
      try {
        const base = p.getCurrentTime();
        const dur = p.getDuration();
        let target = Math.max(0, base + deltaSeconds);
        if (dur && target > dur) target = dur;
        usePlayerStore.getState().registerSeek();
        p.seekTo(target, true);
      } catch {
        // ignore
      }
    } else if (media.kind === "custom-file") {
      const el = customMediaRef.current;
      if (!el) return;
      let target = Math.max(0, el.currentTime + deltaSeconds);
      if (el.duration && target > el.duration) target = el.duration;
      usePlayerStore.getState().registerSeek();
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
            key={`${playbackId}:${media.customTrackId}`}
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
          key={`${playbackId}:${media.customTrackId}`}
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
    // `mt` is a fresh object every render; depend on its stable pieces instead
    // so this memo actually memoizes. mediaCustomTrackId/mediaTracks stand in
    // for the union-only properties the lint rule can't see through.
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media.kind, mediaCustomTrackId, mediaTracks, customTrack, customRefCallback, playbackId, mt.registerRef, coverArtUrl]);

  const seekTo = (target: number) => {
    if (!sessionStarted || media.kind === "none") return;
    usePlayerStore.getState().cancelCountdown();
    if (media.kind === "youtube") {
      const p = yt.playerRef?.current;
      if (!p) return;
      try {
        usePlayerStore.getState().registerSeek();
        p.seekTo(target, true);
      } catch {
        // ignore
      }
    } else if (media.kind === "custom-file") {
      const el = customMediaRef.current;
      if (!el) return;
      usePlayerStore.getState().registerSeek();
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
