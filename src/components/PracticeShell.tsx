"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, getAlternativeLinks } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { PracticeLogCard } from "./PracticeLogCard";
import { PrivateIndicator } from "./PrivateIndicator";
import { CustomPlaybackHUD } from "./CustomPlaybackHUD";
import {
  Music,
  ArrowLeft,
  Sliders,
  Volume2,
  VolumeX,
  Gauge,
  Save,
  Trash2,
  Settings,
  Bookmark,
  Info,
  FileText,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { usePracticeControls } from "@/hooks/usePracticeControls";
import { usePracticeKeyboard } from "@/hooks/usePracticeKeyboard";
import { useIframeFocusGuard } from "@/hooks/useIframeFocusGuard";
import { usePlayerStore } from "@/stores/player-store";
import { SEEK_STEP_S } from "@/lib/constants";
import type { PlaybackEngine } from "@/lib/media-controller";
import type { Song, ProgressMap, CustomTrack } from "@/types/models";
import type { Role } from "@/lib/constants";
import type { CoverState } from "@/hooks/useCoverPracticeEngine";

interface PracticeShellProps {
  song: Song;
  progressMap: ProgressMap;
  onExit: () => void;
  onRefresh: () => void;
  engine: PlaybackEngine;
  capabilities: { canToggle: boolean; hasOffsets: boolean };
  initialVolume?: number;
  initialSpeed?: number;
  /** Player surface JSX (slots for covers, video-preview for originals). */
  mediaSurface?: React.ReactNode;
  /** Cover-only: video toggle */
  onToggleVideo?: () => void;
  /** Cover-specific: offsets, instrument selection */
  coverState?: CoverState;
  /** When true, renders CustomPlaybackHUD over the media surface */
  hasCustomMedia?: boolean;
  /** Original-specific: role selector + stems list */
  activeRole?: Role;
  onActiveRoleChange?: (role: Role) => void;
  availableRoles?: Role[];
  stemTracks?: CustomTrack[];
  registerRef?: (trackId: string) => (el: HTMLMediaElement | null) => void;
  mutedTrackIds?: Set<string>;
}

export function PracticeShell({
  song,
  progressMap,
  onExit,
  onRefresh,
  engine,
  capabilities,
  mediaSurface,
  onToggleVideo,
  coverState,
  hasCustomMedia,
  activeRole,
  onActiveRoleChange,
  availableRoles,
  stemTracks,
  mutedTrackIds,
  initialVolume = 100,
  initialSpeed = 1.0,
}: PracticeShellProps) {
  // Shared volume/speed/markers (identical across cover and original).
  const practiceControls = usePracticeControls({
    songId: song.id,
    initialVolume,
    initialSpeed,
    initialMarkers: progressMap[song.id]?.practiceMarkers ?? [],
    getCurrentTime: () => engine.getCurrentTime(),
    onRefresh,
  });
  const { volume, setVolume, speed, setSpeed, markers, handleSaveCurrentTimeAsMarker, handleDeleteMarker } = practiceControls;

  // Skip overlay
  const [skipOverlay, setSkipOverlay] = useState<{ type: "back" | "forward"; key: number } | null>(null);
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerSkipOverlay = (type: "back" | "forward") => {
    if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
    setSkipOverlay({ type, key: Date.now() });
    overlayTimeoutRef.current = setTimeout(() => setSkipOverlay(null), 600);
  };

  // Keyboard shortcuts
  usePracticeKeyboard({
    onToggleVideo: capabilities.canToggle ? onToggleVideo : undefined,
    onPlayPause: () => {
      engine.playPause();
    },
    onSeekBackward: () => {
      engine.seekBy(-SEEK_STEP_S);
      triggerSkipOverlay("back");
    },
    onSeekForward: () => {
      engine.seekBy(SEEK_STEP_S);
      triggerSkipOverlay("forward");
    },
    onMarkerJump: (index) => {
      if (index < markers.length) engine.seekTo(markers[index]);
    },
  });

  // Focus guard (safe to call unconditionally — checks for iframe presence)
  useIframeFocusGuard();

  // Reset store on mount (always start paused) and unmount
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const reset = usePlayerStore((s) => s.reset);
  useEffect(() => {
    reset();
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prog = progressMap[song.id];

  const isVocals = coverState?.isVocals ?? false;
  const hasBothVideos = coverState?.hasBothVideos ?? false;
  const activeRoleGroup = coverState?.activeRoleGroup;

  return (
    <div className="fixed inset-0 z-50 h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-4 md:px-6 py-4 mb-6 bg-card/10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            onClick={onExit}
            className="text-muted-foreground hover:text-foreground rounded-xl border border-border bg-card/40 h-10 px-3 flex items-center gap-1.5 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit Practice Mode
          </Button>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate max-w-[200px] sm:max-w-xs">
              {song.title}
            </h1>
            <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
          </div>
        </div>
        <div className="flex items-center flex-shrink-0">
          <PrivateIndicator
            text="Settings synced only for you"
            tooltip="All settings, offsets, and markers in Practice Mode are private to your device."
          />
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 px-4 md:px-6 pt-2 overflow-y-auto min-h-0">
        {/* Left: player + controls */}
        <div className="lg:col-span-8 flex flex-col space-y-4">
          <div
            className="relative aspect-video w-full rounded-2xl overflow-hidden border border-border bg-black shadow-2xl flex flex-col items-center justify-center"
            onMouseLeave={() => {
              if (document.activeElement && document.activeElement.tagName === "IFRAME") {
                (document.activeElement as HTMLElement).blur();
                window.focus();
              }
            }}
          >
            {mediaSurface}

            {(hasCustomMedia || engine.isPlaying) && (
              <CustomPlaybackHUD
                engine={engine}
                isPlaying={isPlaying}
                canToggle={capabilities.canToggle}
                onToggle={onToggleVideo}
                activeVideoLabel={coverState?.activeVideo}
              />
            )}

            {skipOverlay && (
              <div
                key={skipOverlay.key}
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 bg-transparent"
              >
                <div className="bg-black/80 text-foreground rounded-full w-24 h-24 flex flex-col items-center justify-center backdrop-blur-md border border-white/10 animate-skip-alert shadow-2xl">
                  <span className="text-2xl font-bold">
                    {skipOverlay.type === "back" ? "◀◀" : "▶▶"}
                  </span>
                  <span className="text-xs font-bold font-mono mt-0.5">
                    {skipOverlay.type === "back" ? "-5s" : "+5s"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Controls card */}
          <Card className="border-border bg-card/40 rounded-xl shadow-lg overflow-hidden">
            <div className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 divide-y md:divide-y-0 md:divide-x divide-[#27282b]">
                {/* Col 1: playback */}
                <div className="space-y-2.5 pb-3 md:pb-0 md:pr-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider block">
                      Playback settings
                    </span>
                    {hasBothVideos && (
                      <span className="text-[10px] text-[#acd1f8] flex items-center gap-1 font-semibold bg-[#2e4057]/20 border border-[#2e4057]/50 px-2 py-0.5 rounded">
                        <Info className="w-3 h-3" />
                        Auto-Sync Active
                      </span>
                    )}
                  </div>

                  {capabilities.canToggle && hasBothVideos && onToggleVideo ? (
                    <div className="flex bg-background/60 p-1 border border-border rounded-xl gap-1 w-full justify-between">
                      <Button
                        onClick={() => { if (coverState?.activeVideo !== "backing") onToggleVideo(); }}
                        className={cn(
                          "text-xs font-bold px-3 py-1.5 h-8 rounded-lg transition-all border-0 flex-1 cursor-pointer",
                          coverState?.activeVideo === "backing"
                            ? "bg-[#2e4057] text-[#acd1f8] hover:bg-[#2e4057] hover:text-[#acd1f8]"
                            : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-card/40"
                        )}
                      >
                        {isVocals ? "Instrumental" : "Backing Track"}
                      </Button>
                      <Button
                        onClick={() => { if (coverState?.activeVideo !== "tab") onToggleVideo(); }}
                        className={cn(
                          "text-xs font-bold px-3 py-1.5 h-8 rounded-lg transition-all border-0 flex-1 cursor-pointer",
                          coverState?.activeVideo === "tab"
                            ? "bg-[#2e4057] text-[#acd1f8] hover:bg-[#2e4057] hover:text-[#acd1f8]"
                            : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-card/40"
                        )}
                      >
                        {isVocals ? "Vocal reference" : "Tab"}
                      </Button>
                    </div>
                  ) : capabilities.canToggle && !hasBothVideos ? (
                    <p className="text-[11px] text-muted-foreground">
                      Dual feeds not configured for this instrument.
                    </p>
                  ) : null}

                  {/* Volume */}
                  <div className="flex items-center gap-3 bg-background/40 border border-border px-3.5 py-2 rounded-xl">
                    <button
                      onClick={() => setVolume(volume === 0 ? 100 : 0)}
                      className="text-[#acd1f8] hover:text-white transition-colors cursor-pointer border-0 bg-transparent p-0 flex items-center"
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
                        <span className="text-[#acd1f8] font-mono">{volume}%</span>
                      </div>
                      <Slider
                        value={[volume]}
                        onValueChange={(val) => setVolume(Array.isArray(val) ? val[0] : val)}
                        min={0}
                        max={100}
                        step={1}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* Speed */}
                  <div className="flex items-center gap-3 bg-background/40 border border-border px-3.5 py-2 rounded-xl">
                    <span className="text-[#acd1f8] flex items-center">
                      <Gauge className="w-3.5 h-3.5" />
                    </span>
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5">
                        <span>Speed</span>
                        <span className="text-[#acd1f8] font-mono">{speed.toFixed(2)}x</span>
                      </div>
                      <Slider
                        value={[speed]}
                        onValueChange={(val) => setSpeed(Array.isArray(val) ? val[0] : val)}
                        min={0.5}
                        max={2.0}
                        step={0.05}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Col 2: markers */}
                <div className="space-y-2.5 pt-3 md:pt-0 md:px-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Bookmark className="w-3.5 h-3.5 text-[#acd1f8]" />
                      Practice Markers
                    </span>
                  </div>

                  <Button
                    onClick={handleSaveCurrentTimeAsMarker}
                    className="w-full bg-[#1b2330] hover:bg-[#202b3c] border border-[#2e4057] text-[#acd1f8] text-[11px] font-bold py-1.5 h-8 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Bookmark className="w-3 h-3 fill-current" />
                    Save Current Time
                  </Button>

                  {markers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto pr-1 scrollbar-thin">
                      {markers.map((time, idx) => (
                        <div
                          key={idx}
                          className="flex items-center bg-background/60 border border-border rounded-lg overflow-hidden h-7"
                        >
                          <button
                            onClick={() => engine.seekTo(time)}
                            className="text-[10px] font-bold text-[#acd1f8] hover:text-foreground px-2 h-full hover:bg-[#2e4057]/30 transition-all cursor-pointer border-0 flex items-center"
                            title={`Jump to marker ${idx + 1}`}
                          >
                            <kbd className="bg-card px-1 py-0.2 rounded border border-border font-mono text-[8px] text-[#acd1f8] mr-1.5">
                              {idx + 1}
                            </kbd>
                            {time.toFixed(1)}s
                          </button>
                          <button
                            onClick={() => handleDeleteMarker(idx)}
                            className="text-muted-foreground hover:text-red-400 px-1.5 h-full hover:bg-red-950/20 border-l border-border transition-all cursor-pointer flex items-center"
                            title="Delete marker"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Col 3: offsets — only when hasOffsets */}
                {capabilities.hasOffsets && coverState && (
                  <div className="space-y-2.5 pt-3 md:pt-0 md:pl-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Settings className="w-3.5 h-3.5 text-[#acd1f8]" />
                        Start Sync Offsets
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {/* Backing offset */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                            {isVocals ? "Instrumental" : "Backing Track"} (s)
                          </label>
                          <button
                            type="button"
                            onClick={() => coverState.setBackingOffset(coverState.getActiveCurrentTime().toFixed(1))}
                            className="text-[9px] text-[#acd1f8] hover:text-foreground px-1.5 py-0.5 bg-[#1b2330] border border-[#2e4057] hover:bg-[#202b3c] rounded flex items-center gap-1 cursor-pointer transition-all"
                            title="Capture current playback time"
                          >
                            <ClockIcon className="w-2.5 h-2.5" /> Capture
                          </button>
                        </div>
                        <div className="flex items-center bg-background/60 border border-border rounded-lg overflow-hidden h-7 w-full justify-between">
                          <button
                            type="button"
                            onClick={() =>
                              coverState.setBackingOffset(Math.max(0, (parseFloat(coverState.backingOffset) || 0) - 0.1).toFixed(1))
                            }
                            className="text-xs font-bold text-muted-foreground hover:text-foreground px-2.5 h-full hover:bg-muted/50 border-r border-border cursor-pointer flex items-center justify-center"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={coverState.backingOffset}
                            onChange={(e) => coverState.setBackingOffset(e.target.value)}
                            className="bg-transparent text-[11px] text-foreground text-center w-full h-full focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              coverState.setBackingOffset(((parseFloat(coverState.backingOffset) || 0) + 0.1).toFixed(1))
                            }
                            className="text-xs font-bold text-muted-foreground hover:text-foreground px-2.5 h-full hover:bg-muted/50 border-l border-border cursor-pointer flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Tab offset */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                            {isVocals ? "Vocal ref" : "Tab Video"} (s)
                          </label>
                          <button
                            type="button"
                            onClick={() => coverState.setTabOffset(coverState.getActiveCurrentTime().toFixed(1))}
                            className="text-[9px] text-[#acd1f8] hover:text-foreground px-1.5 py-0.5 bg-[#1b2330] border border-[#2e4057] hover:bg-[#202b3c] rounded flex items-center gap-1 cursor-pointer transition-all"
                            title="Capture current playback time"
                          >
                            <ClockIcon className="w-2.5 h-2.5" /> Capture
                          </button>
                        </div>
                        <div className="flex items-center bg-background/60 border border-border rounded-lg overflow-hidden h-7 w-full justify-between">
                          <button
                            type="button"
                            onClick={() =>
                              coverState.setTabOffset(Math.max(0, (parseFloat(coverState.tabOffset) || 0) - 0.1).toFixed(1))
                            }
                            className="text-xs font-bold text-muted-foreground hover:text-foreground px-2.5 h-full hover:bg-muted/50 border-r border-border cursor-pointer flex items-center justify-center"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={coverState.tabOffset}
                            onChange={(e) => coverState.setTabOffset(e.target.value)}
                            className="bg-transparent text-[11px] text-foreground text-center w-full h-full focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              coverState.setTabOffset(((parseFloat(coverState.tabOffset) || 0) + 0.1).toFixed(1))
                            }
                            className="text-xs font-bold text-muted-foreground hover:text-foreground px-2.5 h-full hover:bg-muted/50 border-l border-border cursor-pointer flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={coverState.handleSaveOffsets}
                      disabled={coverState.isSavingOffsets || !coverState.activeRoleGroup}
                      className={cn(
                        "w-full text-[11px] font-bold py-1.5 h-8 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer mt-2 transition-all duration-300",
                        coverState.hasUnsavedOffsets && !coverState.isSavingOffsets
                          ? "bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse"
                          : "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground"
                      )}
                    >
                      {coverState.isSavingOffsets ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-3 h-3" />
                          Save Sync Offsets
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Right: instrument/role selection + notation/timeline + log */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          {coverState ? (
            /* Cover: instrument tabs */
            <Card className="border-border bg-card/40 rounded-2xl shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-muted-foreground" />
                  Select Instrument
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs
                  value={coverState.activeTrackId}
                  onValueChange={(val) => {
                    const rg = coverState.standardRoleGroups.find((g) => g.id === val);
                    if (rg) coverState.onInstrumentChange(rg.role);
                  }}
                  className="w-full"
                >
                  <TabsList className="bg-background border border-border p-1 rounded-xl h-auto flex w-full">
                    {coverState.standardRoleGroups.map((rg) => (
                      <TabsTrigger
                        key={rg.id}
                        value={rg.id}
                        className="px-3 py-2 text-xs font-bold rounded-xl data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground border border-transparent data-[state=active]:border-dialog-border hover:text-foreground transition-all cursor-pointer flex-1 text-center"
                      >
                        {rg.role}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            /* Original: instrument tabs — matching cover style */
            availableRoles && onActiveRoleChange && activeRole && (
              <Card className="border-border bg-card/40 rounded-2xl shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-muted-foreground" />
                    Select Instrument
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs
                    value={activeRole}
                    onValueChange={(val) => onActiveRoleChange(val as Role)}
                    className="w-full"
                  >
                    <TabsList className="bg-background border border-border p-1 rounded-xl h-auto flex w-full">
                      {availableRoles.map((role) => (
                        <TabsTrigger
                          key={role}
                          value={role}
                          className="px-3 py-2 text-xs font-bold rounded-xl data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground border border-transparent data-[state=active]:border-dialog-border hover:text-foreground transition-all cursor-pointer flex-1 text-center"
                        >
                          {role === "Piano/Keyboard" ? "Keys" : role}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Tracks matching your instrument are muted. All others play.
                  </p>
                </CardContent>
              </Card>
            )
          )}

          {coverState ? (
            /* Cover: notation links */
            activeRoleGroup && activeRoleGroup.tracks.length > 0 && (
              <Card className="border-border bg-card/40 rounded-2xl shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Music className="w-4 h-4 text-muted-foreground" />
                    Notation Links ({activeRoleGroup.role})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeRoleGroup.tracks.map((track) => {
                    const hasSongsterr = track.tabLink && track.tabLink.includes("-tab-s");
                    const links = getAlternativeLinks(track.tabLink);
                    return (
                      <div
                        key={track.id}
                        className="space-y-2 border-b border-border/60 pb-3 last:border-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[#d1d1d6]">{track.instrumentName}</span>
                          {track.tuning && (
                            <Badge className="bg-background/60 border border-border text-[9px] font-mono text-muted-foreground">
                              {track.tuning}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <a
                            href={links.tab}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              buttonVariants({ variant: "default", size: "sm" }),
                              "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl flex items-center gap-1.5 text-[11px] font-bold py-1.5 px-3 transition-all cursor-pointer"
                            )}
                          >
                            Interactive Tab
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </a>
                          {hasSongsterr && (
                            <>
                              <a
                                href={links.sheet}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  buttonVariants({ variant: "default", size: "sm" }),
                                  "bg-[#1b2330] hover:bg-[#202b3c] border border-[#2e4057] text-foreground rounded-xl flex items-center gap-1.5 text-[11px] font-bold py-1.5 px-3 transition-all cursor-pointer"
                                )}
                              >
                                Sheets
                                <ExternalLink className="w-3 h-3 text-muted-foreground" />
                              </a>
                              <a
                                href={links.chords}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  buttonVariants({ variant: "default", size: "sm" }),
                                  "bg-[#1b2824] hover:bg-[#22352f] border border-[#2d473f] text-foreground rounded-xl flex items-center gap-1.5 text-[11px] font-bold py-1.5 px-3 transition-all cursor-pointer"
                                )}
                              >
                                Chords
                                <ExternalLink className="w-3 h-3 text-muted-foreground" />
                              </a>
                            </>
                          )}
                          {activeRoleGroup.role === "Vocals" && song.lyricsUrl && (
                            <a
                              href={song.lyricsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                buttonVariants({ variant: "default", size: "sm" }),
                                "bg-[#2d1b28] hover:bg-[#3a2233] border-[#4f2d47] text-foreground rounded-xl flex items-center gap-1.5 text-[11px] font-bold py-1.5 px-3 transition-all cursor-pointer"
                              )}
                            >
                              <FileText className="w-3.5 h-3.5 text-[#cf73b5]" />
                              Lyrics
                              <ExternalLink className="w-3 h-3 text-muted-foreground" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )
          ) : (
            /* Original: stems list (no timeline) */
            stemTracks && activeRole && (
              <Card className="border-border bg-card/40 rounded-2xl shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Music className="w-4 h-4 text-muted-foreground" />
                    Stems ({activeRole === "Piano/Keyboard" ? "Keys" : activeRole})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {stemTracks.filter((t) => t.role === activeRole).length === 0 ? (
                    <p className="text-[10px] text-muted-foreground">No stems for this instrument.</p>
                  ) : (
                    stemTracks
                      .filter((t) => t.role === activeRole)
                      .map((track) => {
                        const isMuted = mutedTrackIds?.has(track.id) ?? false;
                        const tuning = song.tunings?.[track.role];
                        return (
                          <div
                            key={track.id}
                            className="space-y-2 border-b border-border/60 pb-3 last:border-0 last:pb-0"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className={cn("font-bold truncate", isMuted ? "text-muted-foreground" : "text-[#d1d1d6]")}>
                                {track.label}
                                {isMuted && <VolumeX className="inline-block w-3 h-3 ml-1.5 text-muted-foreground align-middle" />}
                              </span>
                              {tuning && (
                                <Badge className="bg-background/60 border border-border text-[9px] font-mono text-muted-foreground">
                                  {tuning}
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </CardContent>
              </Card>
            )
          )}

          <PracticeLogCard
            songId={song.id}
            initialStatus={prog?.status}
            initialNotes={prog?.notes ?? ""}
            initialSpeed={prog?.speed}
            onSaveSuccess={onRefresh}
            className="border-border/60 bg-background/60"
            showPrivateIndicator
          />
        </div>
      </div>
    </div>
  );
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
