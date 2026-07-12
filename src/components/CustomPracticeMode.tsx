"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Play,
  Pause,
  ArrowLeft,
  Volume2,
  VolumeX,
  Gauge,
  Trash2,
  Bookmark,
  Music,
  Rewind,
  FastForward,
} from "lucide-react";
import { savePracticeMarkers, saveUserSettings } from "@/app/actions/user";
import { useMultiTrackPlayer } from "@/hooks/useMultiTrackPlayer";
import { usePracticeKeyboard } from "@/hooks/usePracticeKeyboard";
import { TrackLanes, formatTime } from "./TrackLanes";
import { PracticeLogCard } from "./PracticeLogCard";
import { PrivateIndicator } from "./PrivateIndicator";
import { EmptyState } from "./EmptyState";
import { usePlayerStore } from "@/stores/player-store";
import { INSTRUMENT_ROLES, ROLE_LABEL, MAX_MARKERS, SEEK_STEP_S } from "@/lib/constants";
import type { Role } from "@/lib/constants";
import type { Song, CustomTrack, ProgressMap } from "@/types/models";

interface CustomPracticeModeProps {
  song: Song;
  tracks: CustomTrack[];
  onExit: () => void;
  onRefresh: () => void;
  progressMap: ProgressMap;
  preferredInstrument: Role;
  initialVolume: number;
  initialSpeed: number;
}

export function CustomPracticeMode({
  song,
  tracks,
  onExit,
  onRefresh,
  progressMap,
  preferredInstrument,
  initialVolume,
  initialSpeed,
}: CustomPracticeModeProps) {
  const [activeRole, setActiveRole] = useState<Role>(preferredInstrument);
  const [videoPreviewId, setVideoPreviewId] = useState<string | null>(null);

  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const speed = usePlayerStore((s) => s.speed);
  const setSpeed = usePlayerStore((s) => s.setSpeed);
  const markers = usePlayerStore((s) => s.markers);
  const setMarkers = usePlayerStore((s) => s.setMarkers);
  const reset = usePlayerStore((s) => s.reset);

  const mutedTrackIds = useMemo(() => {
    return new Set(tracks.filter((t) => t.role === activeRole).map((t) => t.id));
  }, [tracks, activeRole]);

  const availableRoles = useMemo(() => {
    const roleSet = new Set<string>();
    for (const t of tracks) roleSet.add(t.role);
    return INSTRUMENT_ROLES.filter((r) => roleSet.has(r));
  }, [tracks]);

  const videoTracks = useMemo(() => tracks.filter((t) => t.isVideo), [tracks]);

  useEffect(() => {
    if (videoTracks.length > 0 && !videoTracks.some((t) => t.id === videoPreviewId)) {
      setVideoPreviewId(videoTracks[0].id);
    }
  }, [videoTracks, videoPreviewId]);

  useEffect(() => {
    reset();
    return () => reset();
  }, [reset]);

  const player = useMultiTrackPlayer({
    tracks,
    mutedTrackIds,
    soloTrackIds: new Set(),
    getStreamUrl: (id) => `/api/uploads/${id}`,
  });

  const prog = progressMap[song.id];

  useEffect(() => {
    const p = progressMap[song.id];
    if (p?.practiceMarkers && Array.isArray(p.practiceMarkers)) {
      setMarkers([...p.practiceMarkers].sort((a, b) => a - b));
    } else {
      setMarkers([]);
    }
  }, [song.id, progressMap, setMarkers]);

  const hydratedRef = useRef(false);
  useEffect(() => {
    setVolume(initialVolume);
    setSpeed(initialSpeed);
    hydratedRef.current = true;
  }, [initialVolume, initialSpeed, setVolume, setSpeed]);

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

  usePracticeKeyboard({
    onPlayPause: () => player.playPause(),
    onSeekBackward: () => player.seekBy(-SEEK_STEP_S),
    onSeekForward: () => player.seekBy(SEEK_STEP_S),
    onMarkerJump: (index) => {
      if (index < markers.length) player.seekTo(markers[index]);
    },
  });

  async function handleSaveMarker(newTime: number) {
    if (markers.length >= MAX_MARKERS) {
      toast.error(`You can only save up to ${MAX_MARKERS} practice markers.`);
      return;
    }
    const updated = Array.from(new Set([...markers, newTime])).sort((a, b) => a - b);
    setMarkers(updated);
    try {
      await savePracticeMarkers(song.id, updated);
      toast.success("Marker saved!");
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save marker: " + String(err));
    }
  }

  function handleSaveCurrentTimeAsMarker() {
    const t = player.getCurrentT();
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

  if (tracks.length === 0) {
    return (
      <div className="fixed inset-0 z-50 h-dvh flex flex-col bg-background text-foreground overflow-hidden">
        <header className="flex items-center justify-between border-b border-border px-4 md:px-6 py-4 bg-card/10 flex-shrink-0">
          <Button
            variant="ghost"
            onClick={onExit}
            className="text-muted-foreground hover:text-foreground rounded-xl border border-border bg-card/40 h-10 px-3 flex items-center gap-1.5 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Track Studio
          </Button>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            icon={Music}
            title="No Custom Tracks"
            description="Add tracks in Track Studio first, then practice here."
          />
        </div>
      </div>
    );
  }

  const previewTrack = videoTracks.find((t) => t.id === videoPreviewId) ?? null;
  const isPlaying = player.isPlaying;

  return (
    <div className="fixed inset-0 z-50 h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-4 md:px-6 py-4 mb-4 bg-card/10 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            onClick={onExit}
            className="text-muted-foreground hover:text-foreground rounded-xl border border-border bg-card/40 h-10 px-3 flex items-center gap-1.5 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit
          </Button>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate max-w-[200px] sm:max-w-xs">
              {song.title}
            </h1>
            <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
          </div>
        </div>
        <PrivateIndicator
          text="Private to you"
          tooltip="Your instrument choice, markers, volume and speed are private."
        />
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 px-4 md:px-6 overflow-y-auto min-h-0">
        <div className="lg:col-span-8 flex flex-col space-y-4">
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-border bg-black shadow-2xl flex flex-col items-center justify-center">
            {previewTrack ? (
              <video
                key={previewTrack.id}
                ref={player.registerRef(previewTrack.id)}
                src={`/api/uploads/${previewTrack.id}`}
                className="w-full h-full object-contain"
                preload="metadata"
                playsInline
              />
            ) : (
              <div className="text-center p-6 text-muted-foreground">
                <Music className="w-12 h-12 mx-auto mb-2 text-[#27282b] animate-pulse" />
                <p className="text-sm font-semibold text-foreground">
                  No video tracks. Audio-only practice.
                </p>
              </div>
            )}

            {videoTracks.length > 1 && (
              <div className="absolute bottom-2 left-2 right-2 flex gap-1.5 overflow-x-auto bg-black/60 backdrop-blur-sm rounded-xl p-1.5">
                {videoTracks.map((vt) => (
                  <button
                    key={vt.id}
                    onClick={() => setVideoPreviewId(vt.id)}
                    className={cn(
                      "flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer border",
                      vt.id === videoPreviewId
                        ? "bg-[#2e4057] border-[#2e4057] text-[#acd1f8]"
                        : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {vt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="hidden">
            {tracks
              .filter((t) => t.id !== videoPreviewId)
              .map((track) =>
                track.isVideo ? (
                  <video
                    key={track.id}
                    ref={player.registerRef(track.id)}
                    src={`/api/uploads/${track.id}`}
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <audio
                    key={track.id}
                    ref={player.registerRef(track.id)}
                    src={`/api/uploads/${track.id}`}
                    preload="metadata"
                  />
                )
              )}
          </div>

          <Card className="border-border bg-card/40 rounded-xl shadow-lg overflow-hidden">
            <div className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  onClick={player.playPause}
                  className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl h-10 w-10 p-0 flex items-center justify-center"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button
                  onClick={() => player.seekBy(-SEEK_STEP_S)}
                  variant="ghost"
                  className="bg-background border border-border text-muted-foreground hover:text-foreground rounded-xl h-10 w-10 p-0 flex items-center justify-center"
                  title={`Back ${SEEK_STEP_S}s`}
                >
                  <Rewind className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => player.seekBy(SEEK_STEP_S)}
                  variant="ghost"
                  className="bg-background border border-border text-muted-foreground hover:text-foreground rounded-xl h-10 w-10 p-0 flex items-center justify-center"
                  title={`Forward ${SEEK_STEP_S}s`}
                >
                  <FastForward className="w-4 h-4" />
                </Button>

                <span className="text-xs font-mono text-muted-foreground">
                  {formatTime(player.currentT)} / {formatTime(player.duration)}
                </span>

                <div className="flex items-center gap-2 bg-background/40 border border-border px-3 py-1.5 rounded-xl ml-auto">
                  <button
                    onClick={() => setVolume(volume === 0 ? 100 : 0)}
                    className="text-[#acd1f8] hover:text-white transition-colors cursor-pointer border-0 bg-transparent p-0 flex items-center"
                  >
                    {volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                  <Slider
                    value={[volume]}
                    onValueChange={(val) => setVolume(Array.isArray(val) ? val[0] : val)}
                    min={0}
                    max={100}
                    step={1}
                    className="w-20"
                  />
                </div>

                <div className="flex items-center gap-2 bg-background/40 border border-border px-3 py-1.5 rounded-xl">
                  <Gauge className="w-3.5 h-3.5 text-[#acd1f8]" />
                  <Slider
                    value={[speed]}
                    onValueChange={(val) => setSpeed(Array.isArray(val) ? val[0] : val)}
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    className="w-20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-border">
                <div className="space-y-2.5">
                  <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Bookmark className="w-3.5 h-3.5 text-[#acd1f8]" />
                    Practice Markers
                  </span>
                  <Button
                    onClick={handleSaveCurrentTimeAsMarker}
                    className="w-full bg-[#1b2330] hover:bg-[#202b3c] border border-[#2e4057] text-[#acd1f8] text-[11px] font-bold py-1.5 h-8 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Bookmark className="w-3 h-3 fill-current" />
                    Save Current Time
                  </Button>
                  {markers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto pr-1">
                      {markers.map((time, idx) => (
                        <div
                          key={idx}
                          className="flex items-center bg-background/60 border border-border rounded-lg overflow-hidden h-7"
                        >
                          <button
                            onClick={() => player.seekTo(time)}
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

                <div className="space-y-2.5">
                  <span className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">
                    Now Practicing As
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableRoles.map((role) => (
                      <button
                        key={role}
                        onClick={() => setActiveRole(role)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border",
                          activeRole === role
                            ? "bg-[#2e4057] border-[#2e4057] text-[#acd1f8]"
                            : "bg-background border-border text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {ROLE_LABEL[role]}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Tracks matching your instrument are muted. All others play.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="border-border bg-card/40 rounded-2xl shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <Music className="w-4 h-4 text-muted-foreground" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TrackLanes
                tracks={tracks}
                pxPerSec={50}
                currentT={player.currentT}
                mutedTrackIds={mutedTrackIds}
                soloTrackIds={new Set()}
                interactive={false}
                renderMedia={false}
                registerRef={player.registerRef}
                getStreamUrl={(id) => `/api/uploads/${id}`}
              />
              <p className="text-[10px] text-muted-foreground mt-2">
                Muted tracks are dimmed. Adjust alignment in Track Studio.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-4 flex flex-col space-y-6">
          <Card className="border-border bg-card/40 rounded-2xl shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-foreground">
                Audio Tracks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tracks.filter((t) => !t.isVideo).map((track) => (
                <div
                  key={track.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg border",
                    mutedTrackIds.has(track.id)
                      ? "bg-background/20 border-border/40 opacity-50"
                      : "bg-background/60 border-border"
                  )}
                >
                  <span className="text-xs font-bold text-foreground truncate">{track.label}</span>
                  <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0 ml-2">
                    {ROLE_LABEL[track.role]}
                  </span>
                </div>
              ))}
              {tracks.filter((t) => !t.isVideo).length === 0 && (
                <p className="text-xs text-muted-foreground">No audio tracks.</p>
              )}
            </CardContent>
          </Card>

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
