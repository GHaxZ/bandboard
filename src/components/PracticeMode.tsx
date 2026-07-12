"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, getAlternativeLinks } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { PracticeLogCard } from "./PracticeLogCard";
import { PrivateIndicator } from "./PrivateIndicator";
import { toast } from "sonner";
import {
  Music,
  Video,
  ArrowLeft,
  Sliders,
  Loader2,
  ExternalLink,
  Volume2,
  VolumeX,
  Gauge,
  Save,
  Trash2,
  Settings,
  Bookmark,
  Info,
  FileText,
  Clock,
} from "lucide-react";
import { savePracticeMarkers, saveStartOffsets, saveUserSettings } from "@/app/actions/user";
import { useEnsureMedia } from "@/hooks/useEnsureMedia";
import type { Song, ProgressMap } from "@/types/models";
import { resolveOffsets } from "@/types/models";
import { getYouTubeId } from "@/lib/youtube";
import { useDualSyncedPlayers } from "@/hooks/useDualSyncedPlayers";
import { useIframeFocusGuard } from "@/hooks/useIframeFocusGuard";
import { usePracticeKeyboard } from "@/hooks/usePracticeKeyboard";
import { useYoutubeApi } from "@/hooks/useYoutubeApi";
import { usePlayerStore } from "@/stores/player-store";
import { MAX_MARKERS, SEEK_STEP_S } from "@/lib/constants";
import type { Role } from "@/lib/constants";

interface PracticeModeProps {
  song: Song;
  onExit: () => void;
  onRefresh: () => void;
  progressMap: ProgressMap;
  preferredInstrument: Role;
  initialVolume: number;
  initialSpeed: number;
}

export function PracticeMode({ song, onExit, onRefresh, progressMap, preferredInstrument, initialVolume, initialSpeed }: PracticeModeProps) {
  const apiLoaded = useYoutubeApi();

  const standardRoleGroupsInitial = song.roleGroups.filter((rg) => rg.role !== "Other");
  const otherTracksInitial =
    song.roleGroups.find((rg) => rg.role === "Other")?.tracks || [];

  // Lazy-initialize the active track from the preferred instrument so the very
  // first render (SSR + client) already has a real role group selected. This
  // keeps server/client markup identical and avoids a transient "no track"
  // state that produced a hydration mismatch on the Save Sync Offsets button's
  // `disabled` attribute.
  const [activeTrackId, setActiveTrackId] = useState<string>(() => {
    const matching = standardRoleGroupsInitial.find(
      (rg) => rg.role.toLowerCase() === preferredInstrument.toLowerCase()
    );
    if (matching) return matching.id;
    if (standardRoleGroupsInitial.length > 0) return standardRoleGroupsInitial[0].id;
    if (otherTracksInitial.length > 0) return "other-tab";
    return "";
  });
  const [initializedSongId, setInitializedSongId] = useState<string | null>(null);

  const [skipOverlay, setSkipOverlay] = useState<{ type: "back" | "forward"; key: number } | null>(null);
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSkipOverlay = (type: "back" | "forward") => {
    if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
    setSkipOverlay({ type, key: Date.now() });
    overlayTimeoutRef.current = setTimeout(() => setSkipOverlay(null), 600);
  };

  // Store-backed state
  const activeVideo = usePlayerStore((s) => s.activeVideo);
  const setActiveVideo = usePlayerStore((s) => s.setActiveVideo);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const speed = usePlayerStore((s) => s.speed);
  const setSpeed = usePlayerStore((s) => s.setSpeed);
  const markers = usePlayerStore((s) => s.markers);
  const setMarkers = usePlayerStore((s) => s.setMarkers);
  const reset = usePlayerStore((s) => s.reset);

  const [backingOffset, setBackingOffset] = useState<string>("0");
  const [tabOffset, setTabOffset] = useState<string>("0");
  const [isSavingOffsets, setIsSavingOffsets] = useState(false);

  const standardRoleGroups = standardRoleGroupsInitial;
  const otherTracks = otherTracksInitial;

  const activeRoleGroup = standardRoleGroups.find((rg) => rg.id === activeTrackId);
  const backingVideoId = activeRoleGroup ? getYouTubeId(activeRoleGroup.backingTrackLink) : null;
  const tabVideoId = activeRoleGroup ? getYouTubeId(activeRoleGroup.tabVideoLink) : null;
  const hasBothVideos = !!(backingVideoId && tabVideoId);

  const prog = progressMap[song.id];
  const activeSavedOffsets = resolveOffsets(prog, activeTrackId);
  const backingOffsetVal = activeSavedOffsets.backing;
  const tabOffsetVal = activeSavedOffsets.tab;

  const currentBackingOffset = parseFloat(backingOffset) || 0;
  const currentTabOffset = parseFloat(tabOffset) || 0;
  const hasUnsavedOffsets =
    currentBackingOffset !== backingOffsetVal || currentTabOffset !== tabOffsetVal;

  // Smart initial track selection
  const lastPreferredRef = useRef(preferredInstrument);
  useEffect(() => {
    if (song.id !== initializedSongId || lastPreferredRef.current !== preferredInstrument) {
      const matching = standardRoleGroups.find(
        (rg) => rg.role.toLowerCase() === preferredInstrument.toLowerCase()
      );
      if (matching) setActiveTrackId(matching.id);
      else if (standardRoleGroups.length > 0) setActiveTrackId(standardRoleGroups[0].id);
      else if (otherTracks.length > 0) setActiveTrackId("other-tab");
      setInitializedSongId(song.id);
      lastPreferredRef.current = preferredInstrument;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id, preferredInstrument]);

  // Default active video on track change
  useEffect(() => {
    if (backingVideoId) setActiveVideo("backing");
    else if (tabVideoId) setActiveVideo("tab");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backingVideoId, tabVideoId]);

  // Load markers from progress
  useEffect(() => {
    const p = progressMap[song.id];
    if (p?.practiceMarkers && Array.isArray(p.practiceMarkers)) {
      setMarkers([...p.practiceMarkers].sort((a, b) => a - b));
    } else {
      setMarkers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id, progressMap]);

  // Load offsets from progress (per active role group)
  useEffect(() => {
    const p = progressMap[song.id];
    const saved = resolveOffsets(p, activeTrackId);
    setBackingOffset(String(saved.backing));
    setTabOffset(String(saved.tab));
  }, [song.id, progressMap, activeTrackId]);

  // Lazy-load missing media for the active role group
  useEnsureMedia({
    roleGroupId: activeRoleGroup?.id ?? null,
    role: activeRoleGroup?.role ?? "Other",
    backingTrackLink: activeRoleGroup?.backingTrackLink ?? null,
    tabVideoLink: activeRoleGroup?.tabVideoLink ?? null,
    onLoaded: onRefresh,
  });

  // Dual synced players
  const players = useDualSyncedPlayers({
    backingId: backingVideoId,
    tabId: tabVideoId,
    backingOffset: backingOffsetVal,
    tabOffset: tabOffsetVal,
  });

  // Keyboard shortcuts
  usePracticeKeyboard({
    onToggleVideo: () => players.toggleVideo(),
    onPlayPause: () => {
      players.playPause();
    },
    onSeekBackward: () => {
      players.seekBy(-SEEK_STEP_S);
      triggerSkipOverlay("back");
    },
    onSeekForward: () => {
      players.seekBy(SEEK_STEP_S);
      triggerSkipOverlay("forward");
    },
    onMarkerJump: (index) => {
      if (index < markers.length) players.seekTo(markers[index]);
    },
  });

  // Focus guard — pull focus back out of the YouTube iframe on click so the
  // keyboard shortcuts keep working. Does NOT toggle the video (only the Tab
  // key and the on-screen toggle buttons do that).
  useIframeFocusGuard();

  // Reset store on unmount
  useEffect(() => {
    return () => reset();
  }, [reset]);

  // Seed volume/speed from persisted user settings on mount, then persist
  // subsequent slider changes back to the DB (debounced, one per setting).
  const hydratedRef = useRef(false);
  useEffect(() => {
    setVolume(initialVolume);
    setSpeed(initialSpeed);
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const t = setTimeout(() => {
      void saveUserSettings({ volume });
    }, 500);
    return () => clearTimeout(t);
  }, [volume]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const t = setTimeout(() => {
      void saveUserSettings({ playbackSpeed: speed });
    }, 500);
    return () => clearTimeout(t);
  }, [speed]);

  // Marker handlers
  async function handleSaveMarker(newTime: number) {
    if (markers.length >= MAX_MARKERS) {
      toast.error(
        `You can only save up to ${MAX_MARKERS} practice markers. Please delete an existing one to add a new marker.`
      );
      return;
    }
    const updated = Array.from(new Set([...markers, newTime])).sort((a, b) => a - b);
    setMarkers(updated);
    try {
      await savePracticeMarkers(song.id, updated);
      toast.success("Marker saved successfully!");
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save marker: " + String(err));
    }
  }

  function handleSaveCurrentTimeAsMarker() {
    const t = players.getActiveCurrentTime();
    if (typeof t === "number" && !isNaN(t)) handleSaveMarker(Math.round(t * 1000) / 1000);
  }

  async function handleDeleteMarker(indexToDelete: number) {
    const updated = markers.filter((_, idx) => idx !== indexToDelete);
    setMarkers(updated);
    try {
      await savePracticeMarkers(song.id, updated);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSaveOffsets() {
    setIsSavingOffsets(true);
    try {
      const bOffset = parseFloat(backingOffset) || 0;
      const tOffset = parseFloat(tabOffset) || 0;
      const res = await saveStartOffsets(song.id, activeTrackId, bOffset, tOffset);
      if (res.success) {
        toast.success("Offsets saved successfully!");
        onRefresh();
      } else {
        toast.error("Failed to save offsets: " + res.error);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to save offsets: " + String(err));
    } finally {
      setIsSavingOffsets(false);
    }
  }

  function handleInstrumentChange(role: string) {
    const matching = standardRoleGroups.find((rg) => rg.role === role);
    if (matching) setActiveTrackId(matching.id);
  }

  const isVocals = activeRoleGroup?.role === "Vocals";

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

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 px-4 md:px-6 overflow-y-auto min-h-0">
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
            {backingVideoId && (
              <div
                className="w-full h-full transition-opacity duration-200"
                style={
                  activeVideo === "backing"
                    ? { opacity: 1, pointerEvents: "auto" }
                    : {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        opacity: 0,
                        pointerEvents: "none",
                        zIndex: -10,
                      }
                }
              >
                <div id="backing-player-div" className="w-full h-full" />
              </div>
            )}

            {tabVideoId && (
              <div
                className="w-full h-full transition-opacity duration-200"
                style={
                  activeVideo === "tab"
                    ? { opacity: 1, pointerEvents: "auto" }
                    : {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        opacity: 0,
                        pointerEvents: "none",
                        zIndex: -10,
                      }
                }
              >
                <div id="tab-player-div" className="w-full h-full" />
              </div>
            )}

            {activeVideo === "backing" && !backingVideoId && (
              <div className="text-center p-6 text-muted-foreground">
                <Music className="w-12 h-12 mx-auto mb-2 text-[#27282b] animate-pulse" />
                <p className="text-sm font-semibold text-foreground">
                  No backing track configured for this instrument.
                </p>
              </div>
            )}

            {activeVideo === "tab" && !tabVideoId && (
              <div className="text-center p-6 text-muted-foreground">
                <Video className="w-12 h-12 mx-auto mb-2 text-[#27282b] animate-pulse" />
                <p className="text-sm font-semibold text-foreground">
                  No tab/lesson video configured for this instrument.
                </p>
              </div>
            )}

            {!apiLoaded && (
              <div className="absolute inset-0 bg-background/95 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#5b80a5] mb-2" />
                <p className="text-xs text-muted-foreground">Loading YouTube Player API...</p>
              </div>
            )}

            {(backingVideoId || tabVideoId) && (
              <div
                className="absolute left-[44px] bottom-0 w-[48px] h-[36px] z-10 bg-transparent cursor-default"
                title="Volume controlled via settings below"
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

                  {hasBothVideos ? (
                    <div className="flex bg-background/60 p-1 border border-border rounded-xl gap-1 w-full justify-between">
                      <Button
                        onClick={() => {
                          if (activeVideo !== "backing") players.toggleVideo();
                        }}
                        className={cn(
                          "text-xs font-bold px-3 py-1.5 h-8 rounded-lg transition-all border-0 flex-1 cursor-pointer",
                          activeVideo === "backing"
                            ? "bg-[#2e4057] text-[#acd1f8] hover:bg-[#2e4057] hover:text-[#acd1f8]"
                            : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-card/40"
                        )}
                      >
                        {isVocals ? "Instrumental" : "Backing Track"}
                      </Button>
                      <Button
                        onClick={() => {
                          if (activeVideo !== "tab") players.toggleVideo();
                        }}
                        className={cn(
                          "text-xs font-bold px-3 py-1.5 h-8 rounded-lg transition-all border-0 flex-1 cursor-pointer",
                          activeVideo === "tab"
                            ? "bg-[#2e4057] text-[#acd1f8] hover:bg-[#2e4057] hover:text-[#acd1f8]"
                            : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-card/40"
                        )}
                      >
                        {isVocals ? "Vocal reference" : "Tab"}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Dual feeds not configured for this instrument.
                    </p>
                  )}

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
                            onClick={() => players.seekTo(time)}
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

                {/* Col 3: offsets */}
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
                          onClick={() => setBackingOffset(players.getActiveCurrentTime().toFixed(1))}
                          className="text-[9px] text-[#acd1f8] hover:text-foreground px-1.5 py-0.5 bg-[#1b2330] border border-[#2e4057] hover:bg-[#202b3c] rounded flex items-center gap-1 cursor-pointer transition-all"
                          title="Capture current playback time"
                        >
                          <Clock className="w-2.5 h-2.5" /> Capture
                        </button>
                      </div>
                      <div className="flex items-center bg-background/60 border border-border rounded-lg overflow-hidden h-7 w-full justify-between">
                        <button
                          type="button"
                          onClick={() =>
                            setBackingOffset(Math.max(0, (parseFloat(backingOffset) || 0) - 0.1).toFixed(1))
                          }
                          className="text-xs font-bold text-muted-foreground hover:text-foreground px-2.5 h-full hover:bg-muted/50 border-r border-border cursor-pointer flex items-center justify-center"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={backingOffset}
                          onChange={(e) => setBackingOffset(e.target.value)}
                          className="bg-transparent text-[11px] text-foreground text-center w-full h-full focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setBackingOffset(((parseFloat(backingOffset) || 0) + 0.1).toFixed(1))
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
                          onClick={() => setTabOffset(players.getActiveCurrentTime().toFixed(1))}
                          className="text-[9px] text-[#acd1f8] hover:text-foreground px-1.5 py-0.5 bg-[#1b2330] border border-[#2e4057] hover:bg-[#202b3c] rounded flex items-center gap-1 cursor-pointer transition-all"
                          title="Capture current playback time"
                        >
                          <Clock className="w-2.5 h-2.5" /> Capture
                        </button>
                      </div>
                      <div className="flex items-center bg-background/60 border border-border rounded-lg overflow-hidden h-7 w-full justify-between">
                        <button
                          type="button"
                          onClick={() =>
                            setTabOffset(Math.max(0, (parseFloat(tabOffset) || 0) - 0.1).toFixed(1))
                          }
                          className="text-xs font-bold text-muted-foreground hover:text-foreground px-2.5 h-full hover:bg-muted/50 border-r border-border cursor-pointer flex items-center justify-center"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={tabOffset}
                          onChange={(e) => setTabOffset(e.target.value)}
                          className="bg-transparent text-[11px] text-foreground text-center w-full h-full focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setTabOffset(((parseFloat(tabOffset) || 0) + 0.1).toFixed(1))
                          }
                          className="text-xs font-bold text-muted-foreground hover:text-foreground px-2.5 h-full hover:bg-muted/50 border-l border-border cursor-pointer flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={handleSaveOffsets}
                    disabled={isSavingOffsets || !activeRoleGroup}
                    className={cn(
                      "w-full text-[11px] font-bold py-1.5 h-8 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer mt-2 transition-all duration-300",
                      hasUnsavedOffsets && !isSavingOffsets
                        ? "bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse"
                        : "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground"
                    )}
                  >
                    {isSavingOffsets ? (
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
              </div>
            </div>
          </Card>
        </div>

        {/* Right: instrument + notation + log */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          <Card className="border-border bg-card/40 rounded-2xl shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <Sliders className="w-4 h-4 text-muted-foreground" />
                Select Instrument
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs
                value={activeTrackId}
                onValueChange={(val) => {
                  const rg = standardRoleGroups.find((g) => g.id === val);
                  if (rg) handleInstrumentChange(rg.role);
                }}
                className="w-full"
              >
                <TabsList className="bg-background border border-border p-1 rounded-xl h-auto flex w-full">
                  {standardRoleGroups.map((rg) => (
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

          {activeRoleGroup && activeRoleGroup.tracks.length > 0 && (
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
