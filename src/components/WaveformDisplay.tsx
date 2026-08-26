"use client";

import { useRef, useState, useEffect, memo } from "react";
import { useTheme } from "next-themes";
import { getWaveformPeaks, getCachedPeaks } from "@/lib/waveform";

interface WaveformDisplayProps {
  trackId: string;
  srcUrl: string;
  width: number;
  height: number;
  color?: string;
}

/** Canvas can't use CSS classes — resolve the theme token to a concrete
 *  color at draw time and repaint whenever the resolved theme changes. */
function useThemeColor(fallback: string): string {
  const { resolvedTheme } = useTheme();
  const [color, setColor] = useState(fallback);
  useEffect(() => {
    const value = getComputedStyle(document.body)
      .getPropertyValue("--foreground")
      .trim();
    setColor(value || fallback);
  }, [resolvedTheme, fallback]);
  return color;
}

// memo: the parent (TrackLanes) re-renders every rAF frame while playing and
// on every zoom step; props are primitives so memo skips redundant canvas work.
export const WaveformDisplay = memo(function WaveformDisplay({
  trackId,
  srcUrl,
  width,
  height,
  color,
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(() =>
    getCachedPeaks(trackId) ? "ready" : "loading"
  );
  const resolvedColor = useThemeColor("rgba(255, 255, 255, 0.6)");
  const drawColor = color ?? resolvedColor;

  useEffect(() => {
    let cancelled = false;
    if (getCachedPeaks(trackId)) {
      setStatus("ready");
      return;
    }
    setStatus("loading");
    getWaveformPeaks(trackId, srcUrl)
      .then((result) => {
        if (cancelled) return;
        setStatus(result ? "ready" : "failed");
      })
      .catch(() => {
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, srcUrl]);

  useEffect(() => {
    if (status !== "ready") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cached = getCachedPeaks(trackId);
    if (!cached) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = drawColor;

    const { peaks } = cached;
    const numPeaks = peaks.length / 2;
    const midY = height / 2;
    const amplitude = midY * 0.85;

    // ponytail: cap draw columns — at max zoom a clip spans tens of thousands
    // of px and per-pixel fillRects drop frames on every ctrl+scroll step.
    const stride = Math.max(1, Math.ceil(width / 2048));
    for (let x = 0; x < width; x += stride) {
      const peakIndex = Math.floor(((x + stride / 2) / width) * numPeaks);
      const min = peaks[peakIndex * 2];
      const max = peaks[peakIndex * 2 + 1];
      const minY = midY + min * amplitude;
      const maxY = midY + max * amplitude;
      ctx.fillRect(x, minY, stride, Math.max(1, maxY - minY));
    }
  }, [trackId, width, height, drawColor, status]);

  if (status === "loading") {
    return (
      <div
        style={{ width: `${width}px`, height: `${height}px`, position: "absolute", top: 0, left: 0 }}
        className="flex items-center justify-center pointer-events-none"
      >
        <span className="text-[9px] text-muted-foreground font-mono">Loading...</span>
      </div>
    );
  }

  if (status === "failed") {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${height}px`, position: "absolute", top: 0, left: 0 }}
      className="pointer-events-none"
    />
  );
});
