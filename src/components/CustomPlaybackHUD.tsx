"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Play, Pause } from "lucide-react";
import type { PlaybackEngine } from "@/lib/media-controller";

interface CustomPlaybackHUDProps {
  engine: PlaybackEngine;
  isPlaying: boolean;
  canToggle?: boolean;
  onToggle?: () => void;
  activeVideoLabel?: string;
}

function formatTimeHUD(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function CustomPlaybackHUD({
  engine,
  isPlaying,
  canToggle = false,
  onToggle,
  activeVideoLabel,
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
  // Refs to avoid stale closures in the rAF tick and seek callback when the
  // engine prop changes identity every render (inline literal in callers).
  const engineRef = useRef(engine);
  const durationRef = useRef(duration);
  // Keep refs fresh — using effects instead of writing during render to satisfy
  // the react-hooks/refs lint rule.
  useEffect(() => { engineRef.current = engine; });
  useEffect(() => { durationRef.current = duration; });
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

  // Auto-hide controls after 3s of no mouse movement (only when playing)
  const resetHideTimer = () => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  };

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isPlaying]);

  const handleMouseMove = () => resetHideTimer();
  const handleMouseLeave = () => {
    if (isPlaying) setShowControls(false);
  };

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
      className="absolute inset-0 z-20 flex flex-col justify-end"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handlePlayPause}
    >
      {/* Center play/pause button — visible on hover or when paused */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-opacity duration-200 pointer-events-none",
          showControls || !isPlaying ? "opacity-100" : "opacity-0"
        )}
      >
        <button
          onClick={(e) => { e.stopPropagation(); handlePlayPause(); }}
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

      {/* Bottom bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-10 pb-3 px-4 transition-opacity duration-200",
          showControls || !isPlaying ? "opacity-100" : "opacity-0 pointer-events-none"
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
              {formatTimeHUD(displayTime)} / {formatTimeHUD(duration)}
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
