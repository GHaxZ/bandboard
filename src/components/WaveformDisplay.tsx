"use client";

import { useRef, useState, useEffect } from "react";
import { getWaveformPeaks, getCachedPeaks } from "@/lib/waveform";

interface WaveformDisplayProps {
  trackId: string;
  srcUrl: string;
  width: number;
  height: number;
  color?: string;
}

export function WaveformDisplay({
  trackId,
  srcUrl,
  width,
  height,
  color = "rgba(255, 255, 255, 0.6)",
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(() =>
    getCachedPeaks(trackId) ? "ready" : "loading"
  );

  useEffect(() => {
    let cancelled = false;
    if (getCachedPeaks(trackId)) {
      setStatus("ready");
      return;
    }
    setStatus("loading");
    getWaveformPeaks(trackId, srcUrl).then((result) => {
      if (cancelled) return;
      setStatus(result ? "ready" : "failed");
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
    ctx.fillStyle = color;

    const { peaks } = cached;
    const numPeaks = peaks.length / 2;
    const midY = height / 2;
    const amplitude = midY * 0.85;

    for (let x = 0; x < width; x++) {
      const peakIndex = Math.floor((x / width) * numPeaks);
      const min = peaks[peakIndex * 2];
      const max = peaks[peakIndex * 2 + 1];
      const minY = midY + min * amplitude;
      const maxY = midY + max * amplitude;
      ctx.fillRect(x, minY, 1, Math.max(1, maxY - minY));
    }
  }, [trackId, width, height, color, status]);

  if (status === "loading") {
    return (
      <div
        style={{ width: `${width}px`, height: `${height}px`, position: "absolute", top: 0, left: 0 }}
        className="flex items-center justify-center pointer-events-none"
      >
        <span className="text-[9px] text-white/60 font-mono">Loading...</span>
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
}
