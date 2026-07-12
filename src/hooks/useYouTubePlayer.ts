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
}: UseYouTubePlayerOpts) {
  const apiLoaded = useYoutubeApi();
  const playerRef = useRef<YTPlayer | null>(null);

  // Keep latest values in refs so the one-time YT callbacks read fresh data.
  const onEndedRef = useRef(onEnded);
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

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

  useEffect(() => {
    if (!apiLoaded || !videoId) return;

    const makePlayer = () => {
      const { volume, speed } = usePlayerStore.getState();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const PlayerCtor = (window as any).YT.Player;
      playerRef.current = new PlayerCtor(containerId, {
        videoId,
        playerVars: {
          enablejsapi: 1,
          origin: typeof window !== "undefined" ? window.location.origin : "",
        },
        events: {
          onReady: (event: { target: YTPlayer }) => {
            try {
              event.target.setVolume(volume);
              event.target.setPlaybackRate(speed);
            } catch {
              // ignore
            }
            if (startOffset > 0) {
              try {
                event.target.seekTo(startOffset, true);
              } catch {
                // ignore
              }
            }
          },
          onStateChange: (event: { data: number }) => {
            const state = event.data;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const YTState = (window as any).YT.PlayerState;
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
