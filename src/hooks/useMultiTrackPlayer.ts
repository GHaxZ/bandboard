"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { MULTITRACK_DRIFT_MS } from "@/lib/constants";
import type { CustomTrack } from "@/types/models";

interface UseMultiTrackPlayerOpts {
  tracks: CustomTrack[];
  mutedTrackIds: Set<string>;
  soloTrackIds: Set<string>;
  getStreamUrl: (id: string) => string;
}

// ponytail: rAF-driven currentT state updates every frame. Fine for 5–8 tracks
// (a band); if lane count grows large, throttle to ~30fps or move playhead to a ref.
export function useMultiTrackPlayer({
  tracks,
  mutedTrackIds,
  soloTrackIds,
}: UseMultiTrackPlayerOpts) {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const speed = usePlayerStore((s) => s.speed);

  const [currentT, setCurrentT] = useState(0);

  const mediaRefs = useRef<Map<string, HTMLMediaElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const clockStartRef = useRef(0);
  const TRef = useRef(0);

  const tracksRef = useRef(tracks);
  const mutedRef = useRef(mutedTrackIds);
  const soloRef = useRef(soloTrackIds);
  const durationRef = useRef(0);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);
  useEffect(() => {
    mutedRef.current = mutedTrackIds;
  }, [mutedTrackIds]);
  useEffect(() => {
    soloRef.current = soloTrackIds;
  }, [soloTrackIds]);

  const duration = useMemo(() => {
    return tracks.reduce((max, t) => {
      if (t.duration == null) return max;
      const end = t.startOffset + t.duration;
      return end > max ? end : max;
    }, 0);
  }, [tracks]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const audible = useCallback((track: CustomTrack): boolean => {
    if (mutedRef.current.has(track.id)) return false;
    if (soloRef.current.size > 0 && !soloRef.current.has(track.id)) return false;
    return true;
  }, []);

  const play = useCallback(() => {
    const spd = usePlayerStore.getState().speed;
    const vol = usePlayerStore.getState().volume;
    clockStartRef.current = performance.now() - (TRef.current / spd) * 1000;

    for (const track of tracksRef.current) {
      const el = mediaRefs.current.get(track.id);
      if (!el) continue;
      if (audible(track)) {
        el.muted = false;
        el.volume = vol / 100;
        el.playbackRate = spd;
        const targetTime = Math.max(0, TRef.current - track.startOffset);
        try {
          el.currentTime = targetTime;
        } catch {
          // ignore
        }
        if (TRef.current >= track.startOffset) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      } else {
        el.muted = true;
        el.pause();
      }
    }

    const tick = () => {
      const s = usePlayerStore.getState().speed;
      const T = ((performance.now() - clockStartRef.current) / 1000) * s;
      TRef.current = T;
      const dur = durationRef.current;

      for (const track of tracksRef.current) {
        const el = mediaRefs.current.get(track.id);
        if (!el) continue;
        if (!audible(track)) continue;

        const trackEnd = track.duration == null ? Infinity : track.startOffset + track.duration;

        if (T >= track.startOffset && T < trackEnd) {
          const expected = T - track.startOffset;
          try {
            if (Math.abs(el.currentTime - expected) > MULTITRACK_DRIFT_MS / 1000) {
              el.currentTime = expected;
            }
          } catch {
            // ignore
          }
          if (el.paused) {
            el.play().catch(() => {});
          }
        } else if (T < track.startOffset) {
          if (!el.paused) el.pause();
          try {
            el.currentTime = 0;
          } catch {
            // ignore
          }
        }
      }

      setCurrentT(T);

      if (dur > 0 && T >= dur) {
        TRef.current = dur;
        setCurrentT(dur);
        for (const track of tracksRef.current) {
          const el = mediaRefs.current.get(track.id);
          if (el && !el.paused) el.pause();
        }
        setPlaying(false);
        rafRef.current = null;
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [audible, setPlaying]);

  const pause = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    for (const track of tracksRef.current) {
      const el = mediaRefs.current.get(track.id);
      if (el && !el.paused) el.pause();
    }
  }, []);

  const seekTo = useCallback(
    (T: number) => {
      const dur = durationRef.current;
      const clamped = dur > 0 ? Math.max(0, Math.min(T, dur)) : Math.max(0, T);
      TRef.current = clamped;
      const spd = usePlayerStore.getState().speed;
      clockStartRef.current = performance.now() - (clamped / spd) * 1000;
      setCurrentT(clamped);

      const playing = usePlayerStore.getState().isPlaying;
      for (const track of tracksRef.current) {
        const el = mediaRefs.current.get(track.id);
        if (!el) continue;
        if (audible(track)) {
          el.muted = false;
          const targetTime = Math.max(0, clamped - track.startOffset);
          try {
            el.currentTime = targetTime;
          } catch {
            // ignore
          }
          if (clamped >= track.startOffset && playing) {
            el.play().catch(() => {});
          } else {
            el.pause();
          }
        } else {
          el.muted = true;
          el.pause();
        }
      }
    },
    [audible]
  );

  const seekBy = useCallback(
    (delta: number) => {
      seekTo(TRef.current + delta);
    },
    [seekTo]
  );

  const playPause = useCallback(() => {
    const playing = usePlayerStore.getState().isPlaying;
    if (playing) {
      setPlaying(false);
    } else {
      setPlaying(true);
    }
  }, [setPlaying]);

  const getCurrentT = useCallback(() => TRef.current, []);

  useEffect(() => {
    if (isPlaying) {
      play();
    } else {
      pause();
    }
  }, [isPlaying, play, pause]);

  useEffect(() => {
    for (const track of tracksRef.current) {
      const el = mediaRefs.current.get(track.id);
      if (!el) continue;
      if (audible(track)) {
        el.volume = volume / 100;
      }
    }
  }, [volume, audible]);

  useEffect(() => {
    for (const track of tracksRef.current) {
      const el = mediaRefs.current.get(track.id);
      if (!el) continue;
      el.playbackRate = speed;
    }
    if (usePlayerStore.getState().isPlaying) {
      clockStartRef.current = performance.now() - (TRef.current / speed) * 1000;
    }
  }, [speed]);

  useEffect(() => {
    const vol = usePlayerStore.getState().volume;
    const spd = usePlayerStore.getState().speed;
    for (const track of tracksRef.current) {
      const el = mediaRefs.current.get(track.id);
      if (!el) continue;
      if (audible(track)) {
        el.muted = false;
        el.volume = vol / 100;
        el.playbackRate = spd;
        if (usePlayerStore.getState().isPlaying && el.paused) {
          const targetTime = Math.max(0, TRef.current - track.startOffset);
          try {
            el.currentTime = targetTime;
          } catch {
            // ignore
          }
          if (TRef.current >= track.startOffset) {
            el.play().catch(() => {});
          }
        }
      } else {
        el.muted = true;
        el.pause();
      }
    }
  }, [mutedTrackIds, soloTrackIds, audible]);

  useEffect(() => {
    const refs = mediaRefs.current;
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      for (const [, el] of refs) {
        if (!el.paused) el.pause();
      }
      refs.clear();
    };
  }, []);

  const refCallbacksRef = useRef<
    Map<string, (el: HTMLMediaElement | null) => void>
  >(new Map());

  const registerRef = useCallback((trackId: string) => {
    if (!refCallbacksRef.current.has(trackId)) {
      refCallbacksRef.current.set(trackId, (el) => {
        if (el) {
          mediaRefs.current.set(trackId, el);
        } else {
          mediaRefs.current.delete(trackId);
        }
      });
    }
    return refCallbacksRef.current.get(trackId)!;
  }, []);

  return {
    playPause,
    seekBy,
    seekTo,
    getCurrentT,
    isPlaying,
    duration,
    currentT,
    registerRef,
  };
}
