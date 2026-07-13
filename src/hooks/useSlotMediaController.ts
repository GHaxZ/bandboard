"use client";

import { useRef, useMemo, useCallback, useEffect } from "react";
import { useYouTubePlayer } from "./useYouTubePlayer";
import { usePlayerStore } from "@/stores/player-store";
import type { MediaController } from "@/lib/media-controller";

interface UseSlotMediaControllerOpts {
  yawVideoId: string | null;
  customSrc: string | null;
  containerId: string;
  startOffset: number;
  onEnded?: () => void;
  isActive?: () => boolean;
}

interface UseSlotMediaControllerResult {
  controller: MediaController | null;
  /** Ref callback for the custom-file <video>/<audio> element. Attach as the
   * `ref` of the media element rendered when `customSrc` is set. */
  registerRef: (el: HTMLMediaElement | null) => void;
}

/**
 * Unified slot media controller: wraps either a YouTube IFrame player (when
 * `customSrc` is null) or an HTML <video>/<audio> element (when `customSrc`
 * is set, taking precedence over the YT id).
 *
 * `useYouTubePlayer` is always invoked unconditionally (rules of hooks); when
 * the slot has a custom file, the YT hook receives `videoId: null` and its
 * creation effect early-returns, leaving the div inert. The HTML media element
 * ref is always allocated; when the slot is YT-type, the ref stays null and
 * the controller methods early-return on `mediaElRef.current` being null.
 */
export function useSlotMediaController(
  opts: UseSlotMediaControllerOpts
): UseSlotMediaControllerResult {
  // Always call useYouTubePlayer unconditionally. When customSrc is set, the
  // YT hook receives null and creates no player (effect early-returns).
  const ytHook = useYouTubePlayer({
    containerId: opts.containerId,
    videoId: opts.customSrc ? null : opts.yawVideoId,
    startOffset: opts.startOffset,
    onEnded: opts.onEnded,
    isActive: opts.isActive,
    primeOnReady: true,
  });

  const mediaElRef = useRef<HTMLMediaElement | null>(null);
  const registerRef = useCallback((el: HTMLMediaElement | null) => {
    mediaElRef.current = el;
  }, []);

  // Fresh callback refs (the listeners read these so identity churn is fine).
  const onEndedRef = useRef(opts.onEnded);
  useEffect(() => {
    onEndedRef.current = opts.onEnded;
  }, [opts.onEnded]);

  const isActiveRef = useRef(opts.isActive);
  useEffect(() => {
    isActiveRef.current = opts.isActive;
  }, [opts.isActive]);

  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const speed = usePlayerStore((s) => s.speed);

  // Apply volume/speed from the store to the HTML media element whenever they
  // change (mirrors useYouTubePlayer's YT push-down behaviour).
  useEffect(() => {
    if (mediaElRef.current) {
      mediaElRef.current.volume = Math.max(0, Math.min(1, volume / 100));
    }
  }, [volume]);
  useEffect(() => {
    if (mediaElRef.current) {
      mediaElRef.current.playbackRate = speed;
    }
  }, [speed]);

  // Set start offset once the custom media element mounts.
  useEffect(() => {
    const el = mediaElRef.current;
    if (el && opts.startOffset > 0) {
      el.currentTime = opts.startOffset;
    }
  }, [opts.customSrc, opts.startOffset]);

  // Wire DOM state-change events to the store (when this slot is active) and
  // forward ENDED to the external onEnded callback. Re-binds on src change.
  useEffect(() => {
    const el = mediaElRef.current;
    if (!el || !opts.customSrc) return;
    const handlers: Record<string, () => void> = {
      play: () => {
        if (isActiveRef.current?.() ?? false) setPlaying(true);
      },
      pause: () => {
        if (isActiveRef.current?.() ?? false) setPlaying(false);
      },
      ended: () => {
        if (isActiveRef.current?.() ?? false) setPlaying(false);
        onEndedRef.current?.();
      },
    };
    el.addEventListener("play", handlers.play);
    el.addEventListener("pause", handlers.pause);
    el.addEventListener("ended", handlers.ended);
    return () => {
      el.removeEventListener("play", handlers.play);
      el.removeEventListener("pause", handlers.pause);
      el.removeEventListener("ended", handlers.ended);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.customSrc]);

  // Build the controller. The methods read through refs at call-time so the
  // memo only needs to re-create when the type (custom vs YT) changes.
  const controller = useMemo<MediaController | null>(() => {
    if (opts.customSrc) {
      return {
        play: () => {
          try {
            void mediaElRef.current?.play().catch(() => {});
          } catch {
            // ignore
          }
        },
        pause: () => {
          try {
            mediaElRef.current?.pause();
          } catch {
            // ignore
          }
        },
        seekTo: (t) => {
          if (mediaElRef.current) mediaElRef.current.currentTime = t;
        },
        getCurrentTime: () => mediaElRef.current?.currentTime ?? 0,
        getDuration: () => {
          const d = mediaElRef.current?.duration;
          return d && isFinite(d) ? d : 0;
        },
        getState: () => {
          const el = mediaElRef.current;
          if (!el) return -1;
          if (el.ended) return 0;
          if (el.paused) return 2;
          if (el.readyState < 3) return -1;
          return 1;
        },
        setMuted: (m) => {
          if (mediaElRef.current) mediaElRef.current.muted = m;
        },
        setVolume: (v) => {
          if (mediaElRef.current)
            mediaElRef.current.volume = Math.max(0, Math.min(1, v / 100));
        },
        setPlaybackRate: (r) => {
          if (mediaElRef.current) mediaElRef.current.playbackRate = r;
        },
      };
    }
    // YT case: wrap the YTPlayer ref.
    return {
      play: () => {
        try {
          ytHook.playerRef.current?.playVideo();
        } catch {
          // ignore
        }
      },
      pause: () => {
        try {
          ytHook.playerRef.current?.pauseVideo();
        } catch {
          // ignore
        }
      },
      seekTo: (t, allow) => {
        try {
          ytHook.playerRef.current?.seekTo(t, allow);
        } catch {
          // ignore
        }
      },
      getCurrentTime: () => {
        try {
          return ytHook.playerRef.current?.getCurrentTime() ?? 0;
        } catch {
          return 0;
        }
      },
      getDuration: () => {
        try {
          return ytHook.playerRef.current?.getDuration() ?? 0;
        } catch {
          return 0;
        }
      },
      getState: () => {
        try {
          return ytHook.playerRef.current?.getPlayerState() ?? -1;
        } catch {
          return -1;
        }
      },
      setMuted: (m) => {
        try {
          if (m) ytHook.playerRef.current?.mute();
          else ytHook.playerRef.current?.unMute();
        } catch {
          // ignore
        }
      },
      setVolume: (v) => {
        try {
          ytHook.playerRef.current?.setVolume(v);
        } catch {
          // ignore
        }
      },
      setPlaybackRate: (r) => {
        try {
          ytHook.playerRef.current?.setPlaybackRate(r);
        } catch {
          // ignore
        }
      },
    };
    // ytHook.playerRef identity is stable; including it satisfies the lint
    // rule without actually triggering re-memos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.customSrc, opts.yawVideoId, ytHook.playerRef]);

  return { controller, registerRef };
}