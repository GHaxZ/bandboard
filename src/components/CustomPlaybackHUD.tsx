"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn, formatTime } from "@/lib/utils";
import { Play, Pause } from "lucide-react";
import type { PlaybackEngine } from "@/lib/media-controller";

interface CustomPlaybackHUDProps {
  engine: PlaybackEngine;
  isPlaying: boolean;
  canToggle?: boolean;
  onToggle?: () => void;
  activeVideoLabel?: string;
  /** When true, hides the custom center play/pause button and sets the root
   * overlay to pointer-events:none so the YouTube iframe beneath receives
   * clicks and hover events. A transparent child overlay toggles
   * pointer-events:auto when the HUD is hidden (capturing mousemove to
   * re-show it) and pointer-events:none when the HUD is visible (letting
   * mouse events pass through to the YouTube iframe so its native pause
   * button appears on hover). The bottom bar stays interactive. */
  youTubeMode?: boolean;
}

export function CustomPlaybackHUD({
  engine,
  isPlaying,
  canToggle = false,
  onToggle,
  activeVideoLabel,
  youTubeMode = false,
}: CustomPlaybackHUDProps) {
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const dragTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // ponytail: cooldown filters the synthetic mouseenter the browser fires when
  // the overlay's pointer-events toggles under a stationary cursor. Without it,
  // the HUD hides → overlay gains pointer-events:auto → synthetic mouseenter →
  // re-shows → 4s later hides → loop. 150ms is ~9 frames; real mouse movement
  // arrives seconds after the 4s timeout, so it's never blocked.
  const lastHidAtRef = useRef(0);
  // Refs to avoid stale closures in the rAF tick and seek callback when the
  // engine prop changes identity every render (inline literal in callers).
  const engineRef = useRef(engine);
  const durationRef = useRef(duration);
  const isPlayingRef = useRef(isPlaying);
  // Keep refs fresh — using effects instead of writing during render to satisfy
  // the react-hooks/refs lint rule.
  useEffect(() => { engineRef.current = engine; });
  useEffect(() => { durationRef.current = duration; });
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { dragTimeRef.current = dragTime; }, [dragTime]);

  // Track current time and duration via rAF while HUD is mounted (stable deps).
  // Also resolves pending seek: once getCurrentTime() catches up to where the
  // user released the scrubber, clear the pending so the rAF time takes over.
  useEffect(() => {
    const tick = () => {
      const eng = engineRef.current;
      const live = eng.getCurrentTime?.() ?? 0;
      setCurrentTime(live);
      setDuration(eng.duration ?? 0);
      const pending = pendingSeekRef.current;
      if (pending != null && Math.abs(live - pending) < 0.5) {
        pendingSeekRef.current = null;
        setPendingSeek(null);
      } else {
        setPendingSeek(pending);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Auto-hide controls after 4s of no mouse movement (only when playing)
  const resetHideTimer = useCallback(() => {
    if (Date.now() - lastHidAtRef.current < 150) return;
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlayingRef.current) {
      hideTimerRef.current = setTimeout(() => {
        lastHidAtRef.current = Date.now();
        setShowControls(false);
      }, 4000);
    }
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      // Arm the auto-hide countdown when playback begins so the HUD
      // hides even if no mouse event follows (e.g. play via the YT
      // iframe, autoplay, or a pause→play toggle with the mouse outside).
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        lastHidAtRef.current = Date.now();
        setShowControls(false);
      }, 4000);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying]);

  const handleMouseLeave = useCallback(() => {
    if (isPlayingRef.current) resetHideTimer();
  }, [resetHideTimer]);

  const handlePlayPause = () => engineRef.current.playPause();

  const seekToClientX = useCallback((clientX: number) => {
    const dur = durationRef.current;
    if (!progressRef.current || dur <= 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setDragTime(pct * dur);
  }, []);

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    seekToClientX(e.clientX);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => seekToClientX(e.clientX);
    const onUp = () => {
      const target = dragTimeRef.current;
      setIsDragging(false);
      setDragTime(null);
      if (target != null) {
        pendingSeekRef.current = target;
        setPendingSeek(target);
        engineRef.current.seekTo?.(target);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, seekToClientX]);

  const displayTime =
    dragTime != null ? dragTime
    : pendingSeek != null ? pendingSeek
    : currentTime;
  const progressPct = duration > 0 ? (displayTime / duration) * 100 : 0;

  return (
    <div
      ref={rootRef}
      className={cn(
        "absolute inset-0 z-20 flex flex-col justify-end",
        youTubeMode && "pointer-events-none"
      )}
      {...(youTubeMode
        ? {} // YT mode: overlay child captures mouse events (see below)
        : {
            onMouseEnter: () => resetHideTimer(),
            onMouseMove: () => resetHideTimer(),
            onMouseLeave: () => handleMouseLeave(),
            onClick: () => engineRef.current.playPause(),
          })}
    >
      {/* YT mode: transparent overlay re-enables pointer-events (overriding
          the root's pointer-events:none) so mousemove is captured directly.
          The cross-origin YT iframe swallows mousemove at the window level,
          so the old window-listener approach never fired while the cursor was
          over the iframe. Rendered before the bottom bar so the bar
          (pointer-events:auto when visible) sits on top and receives clicks
          in its area. */}
      {youTubeMode && (
        <div
          className={cn("absolute inset-0", !showControls && "pointer-events-auto")}
          onMouseEnter={() => resetHideTimer()}
          onMouseMove={() => resetHideTimer()}
          onMouseLeave={() => handleMouseLeave()}
          onClick={() => engineRef.current.playPause()}
        />
      )}

      {/* Center play/pause button — only for non-YouTube (so YT's own center
          play/pause button is clickable) */}
      {!youTubeMode && (
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity duration-200 pointer-events-none",
            showControls || !isPlaying ? "opacity-100" : "opacity-0"
          )}
        >
          <button
            onClick={(e) => { e.stopPropagation(); engineRef.current.playPause(); }}
            className="w-16 h-16 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white hover:bg-black/80 transition-all cursor-pointer pointer-events-auto"
            title={isPlaying ? "Pause" : "Play"}
          >
            <div className="w-7 h-7 flex items-center justify-center">
              {isPlaying ? (
                <Pause className="w-7 h-7 fill-white" />
              ) : (
                <Play className="w-7 h-7 fill-white" />
              )}
            </div>
          </button>
        </div>
      )}

      {/* Bottom bar — overlays/blocks YT bottom items when youTubeMode is active */}
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseMove={() => resetHideTimer()}
        className={cn(
          "bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-10 pb-3 px-4 transition-opacity duration-200",
          showControls || !isPlaying
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
      >
        {/* Progress bar */}
        <div
          ref={progressRef}
          className={cn(
            "w-full h-1.5 bg-white/20 rounded-full cursor-pointer mb-3 group relative",
            isDragging && "h-2.5"
          )}
          onMouseDown={handleProgressMouseDown}
        >
          <div
            className="h-full bg-[#acd1f8] rounded-full relative"
            style={{ width: `${progressPct}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow" />
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button
              onClick={handlePlayPause}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white hover:bg-white/10 transition-all cursor-pointer"
              title={isPlaying ? "Pause" : "Play"}
            >
              <div className="w-5 h-5 flex items-center justify-center">
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
              </div>
            </button>

            {/* Time display */}
            <span className="text-[11px] font-mono text-white/80 select-none">
              {formatTime(displayTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Toggle (for covers) */}
            {canToggle && onToggle && activeVideoLabel && (
              <button
                onClick={onToggle}
                className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white/80 hover:text-white hover:bg-white/10 border border-white/20 transition-all cursor-pointer"
                title="Toggle backing/tab"
              >
                {activeVideoLabel === "backing" ? "Backing" : "Tab"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
