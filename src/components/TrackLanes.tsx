"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ROLE_COLORS, DAW_PX_PER_SEC_MIN, DAW_PX_PER_SEC_MAX } from "@/lib/constants";
import { Volume2, VolumeX, Headphones } from "lucide-react";
import { WaveformDisplay } from "./WaveformDisplay";
import type { CustomTrack } from "@/types/models";

export function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const TICK_INTERVALS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function computeTickSec(pxPerSec: number): number {
  for (const sec of TICK_INTERVALS) {
    if (sec * pxPerSec >= 60) return sec;
  }
  return 600;
}

function laneHeight(track: CustomTrack): number {
  return track.isVideo ? 96 : 80;
}

interface TrackLanesProps {
  tracks: CustomTrack[];
  pxPerSec: number;
  currentT: number;
  mutedTrackIds: Set<string>;
  soloTrackIds: Set<string>;
  interactive: boolean;
  renderMedia?: boolean;
  onDragEnd?: (trackId: string, newStartOffset: number) => void;
  onRulerSeek?: (T: number) => void;
  onToggleMute?: (trackId: string) => void;
  onToggleSolo?: (trackId: string) => void;
  onZoomChange?: (newPxPerSec: number) => void;
  onTrackMetadata?: (trackId: string, duration: number) => void;
  registerRef: (trackId: string) => (el: HTMLMediaElement | null) => void;
  getStreamUrl: (id: string) => string;
}

export function TrackLanes({
  tracks,
  pxPerSec,
  currentT,
  mutedTrackIds,
  soloTrackIds,
  interactive,
  renderMedia = true,
  onDragEnd,
  onRulerSeek,
  onToggleMute,
  onToggleSolo,
  onZoomChange,
  onTrackMetadata,
  registerRef,
  getStreamUrl,
}: TrackLanesProps) {
  const [dragState, setDragState] = useState<{
    trackId: string;
    startOffsetAtDown: number;
    pointerXAtDown: number;
    currentOffset: number;
  } | null>(null);

  const [rulerDragging, setRulerDragging] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pxPerSecRef = useRef(pxPerSec);
  const onZoomChangeRef = useRef(onZoomChange);

  useEffect(() => {
    pxPerSecRef.current = pxPerSec;
  }, [pxPerSec]);

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + el.scrollLeft;
      const cursorT = cursorX / pxPerSecRef.current;

      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newPxPerSec = Math.max(
        DAW_PX_PER_SEC_MIN,
        Math.min(DAW_PX_PER_SEC_MAX, pxPerSecRef.current * factor)
      );

      const newCursorX = cursorT * newPxPerSec;
      el.scrollLeft = Math.max(0, newCursorX - (e.clientX - rect.left));

      onZoomChangeRef.current?.(newPxPerSec);
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const maxEnd = tracks.reduce((max, t) => {
    const end = t.duration != null ? t.startOffset + t.duration : t.startOffset + 10;
    return Math.max(max, end);
  }, 10);
  const timelineWidth = Math.max(maxEnd * pxPerSec, 400);

  const tickSec = computeTickSec(pxPerSec);
  const ticks: number[] = [];
  for (let t = 0; t <= maxEnd; t += tickSec) {
    ticks.push(t);
  }

  function handlePointerDown(e: React.PointerEvent, track: CustomTrack) {
    if (!interactive) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDragState({
      trackId: track.id,
      startOffsetAtDown: track.startOffset,
      pointerXAtDown: e.clientX,
      currentOffset: track.startOffset,
    });
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState) return;
    const deltaSec = (e.clientX - dragState.pointerXAtDown) / pxPerSec;
    const newOffset = Math.max(0, dragState.startOffsetAtDown + deltaSec);
    setDragState((prev) => (prev ? { ...prev, currentOffset: newOffset } : null));
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (dragState) {
      onDragEnd?.(dragState.trackId, Math.round(dragState.currentOffset * 1000) / 1000);
      setDragState(null);
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function handleRulerPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const T = Math.max(0, (e.clientX - rect.left) / pxPerSec);
    onRulerSeek?.(T);
    setRulerDragging(true);
  }

  function handleRulerPointerMove(e: React.PointerEvent) {
    if (!rulerDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const T = Math.max(0, (e.clientX - rect.left) / pxPerSec);
    onRulerSeek?.(T);
  }

  function handleRulerPointerUp(e: React.PointerEvent) {
    setRulerDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex border border-border rounded-xl bg-background/40 overflow-hidden">
      {/* Left column — track labels + mute/solo */}
      <div className="flex-shrink-0 w-48 border-r border-border bg-card/20">
        <div className="h-10 border-b border-border flex items-center justify-center">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Track</span>
        </div>
        {tracks.map((track) => {
          const isMuted = mutedTrackIds.has(track.id);
          const isSoloed = soloTrackIds.has(track.id);
          return (
            <div
              key={track.id}
              className="border-b border-border/40 flex items-center gap-1 px-2"
              style={{ height: laneHeight(track) }}
            >
              <span className="text-xs font-bold text-foreground truncate flex-1 min-w-0 text-center">{track.label}</span>
              {interactive && (
                <>
                  <button
                    onClick={() => onToggleMute?.(track.id)}
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer border flex-shrink-0",
                      isMuted
                        ? "bg-red-950/30 border-red-900/40 text-red-400"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    )}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => onToggleSolo?.(track.id)}
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer border flex-shrink-0",
                      isSoloed
                        ? "bg-[#2e4057]/40 border-[#2e4057] text-[#acd1f8]"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    )}
                    title={isSoloed ? "Unsolo" : "Solo"}
                  >
                    <Headphones className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Right — scrollable timeline */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto">
        <div className="relative" style={{ width: timelineWidth, minWidth: "100%" }}>
          <div
            className="h-10 border-b border-border relative cursor-pointer select-none"
            onPointerDown={handleRulerPointerDown}
            onPointerMove={handleRulerPointerMove}
            onPointerUp={handleRulerPointerUp}
          >
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 bottom-0 border-l border-border/60"
                style={{ left: t * pxPerSec }}
              >
                <span className="absolute top-1 left-1 text-[9px] font-mono text-muted-foreground pointer-events-none">
                  {formatTime(t)}
                </span>
              </div>
            ))}
          </div>

          {tracks.map((track) => {
            const displayOffset =
              dragState?.trackId === track.id ? dragState.currentOffset : track.startOffset;
            const clipLeft = displayOffset * pxPerSec;
            const clipWidth = Math.max(
              (track.duration ?? 2) * pxPerSec,
              60
            );
            const isMuted = mutedTrackIds.has(track.id);
            const isSoloed = soloTrackIds.has(track.id);
            const isDimmed = isMuted || (soloTrackIds.size > 0 && !isSoloed);
            const h = laneHeight(track);
            const clipInnerHeight = h - 8;

            return (
              <div
                key={track.id}
                className="relative border-b border-border/40"
                style={{ height: h }}
              >
                <div
                  className={cn(
                    "absolute top-1 bottom-1 rounded-lg overflow-hidden border border-border/60",
                    interactive && "cursor-grab active:cursor-grabbing",
                    ROLE_COLORS[track.role],
                    isDimmed ? "opacity-40" : "opacity-80"
                  )}
                  style={{ left: clipLeft, width: clipWidth }}
                  onPointerDown={interactive ? (e) => handlePointerDown(e, track) : undefined}
                  onPointerMove={interactive ? handlePointerMove : undefined}
                  onPointerUp={interactive ? handlePointerUp : undefined}
                >
                  {renderMedia && track.isVideo && (
                    <video
                      ref={registerRef(track.id)}
                      src={getStreamUrl(track.id)}
                      className="w-full h-full object-cover"
                      preload="metadata"
                      playsInline
                      onLoadedMetadata={(e) =>
                        onTrackMetadata?.(track.id, e.currentTarget.duration)
                      }
                    />
                  )}
                  {renderMedia && !track.isVideo && (
                    <>
                      <audio
                        ref={registerRef(track.id)}
                        src={getStreamUrl(track.id)}
                        preload="metadata"
                        onLoadedMetadata={(e) =>
                          onTrackMetadata?.(track.id, e.currentTarget.duration)
                        }
                      />
                      <WaveformDisplay
                        trackId={track.id}
                        srcUrl={getStreamUrl(track.id)}
                        width={clipWidth}
                        height={clipInnerHeight}
                      />
                    </>
                  )}
                  <span
                    className="absolute top-1 left-1.5 text-[10px] font-bold text-white truncate pointer-events-none max-w-[calc(100%-8px)]"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                  >
                    {track.label}
                  </span>
                </div>
              </div>
            );
          })}

          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[#acd1f8] z-20 pointer-events-none"
            style={{ left: currentT * pxPerSec }}
          >
            <div className="w-2.5 h-2.5 -ml-[5px] rounded-full bg-[#acd1f8]" />
          </div>
        </div>
      </div>
    </div>
  );
}
