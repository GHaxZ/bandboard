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
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // Track current time and duration via rAF while HUD is mounted
  useEffect(() => {
    const tick = () => {
      setCurrentTime(engine.getCurrentTime?.() ?? 0);
      setDuration(engine.duration ?? 0);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [engine]);

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

  const handlePlayPause = () => engine.playPause();

  const seekToClientX = useCallback((clientX: number) => {
    if (!progressRef.current || duration <= 0) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    engine.seekTo?.(pct * duration);
  }, [duration, engine]);

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    seekToClientX(e.clientX);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => seekToClientX(e.clientX);
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, seekToClientX]);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

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
          className="w-full h-1.5 bg-white/20 rounded-full cursor-pointer mb-3 group relative"
          onMouseDown={handleProgressMouseDown}
        >
          <div
            className={cn(
              "h-full bg-[#acd1f8] rounded-full relative",
              isDragging && "h-2.5"
            )}
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
              {formatTimeHUD(currentTime)} / {formatTimeHUD(duration)}
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
