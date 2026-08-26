"use client";

import { Volume2, VolumeX, Gauge } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface VolumeSpeedControlsProps {
  volume: number;
  onVolumeChange: (v: number) => void;
  speed: number;
  onSpeedChange: (v: number) => void;
  /** Extra classes for each control block (e.g. "flex-1 min-w-[160px]"). */
  blockClassName?: string;
}

/** Shared volume + playback-speed slider pair (mute toggle included). Used by
 *  practice mode's control panel and the original editor's toolbar. */
export function VolumeSpeedControls({
  volume,
  onVolumeChange,
  speed,
  onSpeedChange,
  blockClassName = "",
}: VolumeSpeedControlsProps) {
  return (
    <>
      {/* Volume */}
      <div
        className={`flex items-center gap-3 bg-background/40 border border-border px-3.5 py-2 rounded-xl ${blockClassName}`}
      >
        <button
          onClick={() => onVolumeChange(volume === 0 ? 100 : 0)}
          aria-label={volume === 0 ? "Unmute" : "Mute"}
          title={volume === 0 ? "Unmute" : "Mute"}
          className="text-accent-text hover:text-accent-text-strong transition-colors cursor-pointer border-0 bg-transparent p-2 -m-2 rounded-md flex items-center"
        >
          {volume === 0 ? (
            <VolumeX className="w-3.5 h-3.5" />
          ) : (
            <Volume2 className="w-3.5 h-3.5" />
          )}
        </button>
        <div className="flex flex-col flex-1">
          <div className="flex items-center justify-between text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5">
            <span>Volume</span>
            <span className="text-accent-text font-mono">{volume}%</span>
          </div>
          <Slider
            value={[volume]}
            onValueChange={(val) => onVolumeChange(Array.isArray(val) ? val[0] : val)}
            min={0}
            max={100}
            step={1}
            className="w-full"
          />
        </div>
      </div>

      {/* Speed */}
      <div
        className={`flex items-center gap-3 bg-background/40 border border-border px-3.5 py-2 rounded-xl ${blockClassName}`}
      >
        <span className="text-accent-text flex items-center">
          <Gauge className="w-3.5 h-3.5" />
        </span>
        <div className="flex flex-col flex-1">
          <div className="flex items-center justify-between text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5">
            <span>Speed</span>
            <span className="text-accent-text font-mono">{speed.toFixed(2)}x</span>
          </div>
          <Slider
            value={[speed]}
            onValueChange={(val) => onSpeedChange(Array.isArray(val) ? val[0] : val)}
            min={0.5}
            max={2.0}
            step={0.05}
            className="w-full"
          />
        </div>
      </div>
    </>
  );
}
