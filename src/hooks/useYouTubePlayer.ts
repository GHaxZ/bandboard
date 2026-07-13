"use client";

import { useEffect, useRef, useCallback } from "react";
import { useYoutubeApi } from "./useYoutubeApi";
import { usePlayerStore, type YTPlayer } from "@/stores/player-store";

interface UseYouTubePlayerOpts {
  containerId: string;
  videoId: string | null;
  startOffset: number;
  /** Called when the active player ends. */
  onEnded?: () => void;
  /** Whether this player is the active (state-syncing) one. */
  isActive?: () => boolean;
  /** When true, plays the video as soon as the player is ready (used for setlist autostart). */
  autoplay?: boolean;
  /** When true (practice mode), play-then-pause on ready so the first frame
   *  renders and the YT center play button is hidden. Only primes the active slot. */
  primeOnReady?: boolean;
}

/**
 * Manages a single YT.Player instance bound to a div id.
 *
 * - On `videoId` change: if a player exists, `loadVideoById`; else create one.
 * - Reads `volume`/`speed` from the store so event callbacks stay fresh.
 * - Syncs `isPlaying` to the store (only when `isActive()` returns true).
 * - Cleans up on unmount.
 */
export function useYouTubePlayer({
  containerId,
  videoId,
  startOffset,
  onEnded,
  isActive,
  autoplay,
  primeOnReady,
}: UseYouTubePlayerOpts) {
  const apiLoaded = useYoutubeApi();
  const playerRef = useRef<YTPlayer | null>(null);
  // Generation counter: incremented on cleanup so stale YT callbacks (firing after
  // destroy, e.g. in React Strict Mode) are detected and skipped, preventing
  // "Invalid state: Controller is already closed" errors.
  const generationRef = useRef(0);

  // Keep latest values in refs so the one-time YT callbacks read fresh data.
  const onEndedRef = useRef(onEnded);
  const isActiveRef = useRef(isActive);
  const autoplayRef = useRef(autoplay);
  const primeOnReadyRef = useRef(primeOnReady);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  useEffect(() => {
    autoplayRef.current = autoplay;
  }, [autoplay]);
  useEffect(() => {
    primeOnReadyRef.current = primeOnReady;
  }, [primeOnReady]);

  // Priming state: briefly play then pause to render the first frame.
  const primingRef = useRef(false);
  const primingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPlaying = usePlayerStore((s) => s.setPlaying);

  const applySettings = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    const { volume, speed } = usePlayerStore.getState();
    try {
      p.setVolume(volume);
      p.setPlaybackRate(speed);
    } catch {
      // ignore before ready
    }
  }, []);

  // Generation counter for guarding against stale YT player callbacks.
  // Stored in a ref (stable identity) so it doesn't need to be in the deps array.
  const genRef = generationRef;

  useEffect(() => {
    if (!apiLoaded || !videoId) return;

    const makePlayer = () => {
      // Increment generation so any callbacks from a previous player are skipped.
      const gen = ++genRef.current;
      const { volume, speed } = usePlayerStore.getState();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const PlayerCtor = (window as any).YT.Player;
      playerRef.current = new PlayerCtor(containerId, {
        videoId,
        playerVars: {
          enablejsapi: 1,
          origin: typeof window !== "undefined" ? window.location.origin : "",
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
        },
        events: {
          onReady: (event: { target: YTPlayer }) => {
            // Guard: skip if this player is no longer current (destroyed in Strict Mode, etc.)
            if (gen !== generationRef.current) return;
            try {
              event.target.setVolume(volume);
              event.target.setPlaybackRate(speed);
            } catch {
              // ignore
            }
            if (autoplayRef.current) {
              try {
                event.target.playVideo();
              } catch {
                // ignore
              }
              return;
            }
            // Practice mode: prime the video so the first frame renders (hides
            // the YT center play button). Only prime the active slot.
            const active = isActiveRef.current?.() ?? true;
            if (primeOnReadyRef.current && active) {
              primingRef.current = true;
              try {
                event.target.mute();
                if (startOffset > 0) event.target.seekTo(startOffset, true);
                event.target.playVideo();
              } catch {
                // ignore
              }
              // Fallback: if PLAYING never fires (e.g. blocked), abort priming.
              primingTimeoutRef.current = setTimeout(() => {
                if (!primingRef.current) return;
                primingRef.current = false;
                try {
                  event.target.pauseVideo();
                  if (startOffset > 0) event.target.seekTo(startOffset, true);
                  event.target.setVolume(usePlayerStore.getState().volume);
                  event.target.unMute();
                } catch {
                  // ignore
                }
              }, 1500);
              return;
            }
            // Default: seek to offset and pause (original cued behaviour).
            if (startOffset > 0) {
              try {
                event.target.seekTo(startOffset, true);
                event.target.pauseVideo();
              } catch {
                // ignore
              }
            }
          },
          onStateChange: (event: { data: number; target: YTPlayer }) => {
            // Guard: skip if this player is no longer current.
            if (gen !== generationRef.current) return;
            const state = event.data;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const YTState = (window as any).YT.PlayerState;
            // During priming, pause on first PLAYING, reset to start, restore
            // audio. Don't sync isPlaying to the store while priming.
            if (primingRef.current) {
              if (state === YTState.PLAYING) {
                primingRef.current = false;
                if (primingTimeoutRef.current) {
                  clearTimeout(primingTimeoutRef.current);
                  primingTimeoutRef.current = null;
                }
                try {
                  event.target.pauseVideo();
                  if (startOffset > 0) event.target.seekTo(startOffset, true);
                  event.target.setVolume(usePlayerStore.getState().volume);
                  event.target.unMute();
                } catch {
                  // ignore
                }
              }
              return;
            }
            if (isActiveRef.current?.() ?? true) {
              if (state === YTState.PLAYING) setPlaying(true);
              else if (state === YTState.PAUSED) setPlaying(false);
            }
            if (state === YTState.ENDED) {
              onEndedRef.current?.();
            }
          },
        },
      }) as YTPlayer;
    };

    if (playerRef.current && typeof playerRef.current.loadVideoById === "function") {
      try {
        playerRef.current.loadVideoById({ videoId, startSeconds: startOffset });
        applySettings();
      } catch {
        // fall back to recreate
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
        makePlayer();
      }
    } else {
      makePlayer();
    }

    return () => {
      // Invalidate any pending callbacks from this player.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      genRef.current++;
      if (primingTimeoutRef.current) {
        clearTimeout(primingTimeoutRef.current);
        primingTimeoutRef.current = null;
      }
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiLoaded, videoId, containerId]);

  // Sync volume / speed changes to the live player.
  const volume = usePlayerStore((s) => s.volume);
  const speed = usePlayerStore((s) => s.speed);
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.setVolume(volume);
    } catch {
      // ignore
    }
  }, [volume]);
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.setPlaybackRate(speed);
    } catch {
      // ignore
    }
  }, [speed]);

  return { playerRef, applySettings };
}
