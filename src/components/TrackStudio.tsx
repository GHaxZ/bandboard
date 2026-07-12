"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Play,
  Pause,
  Square,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  ArrowLeft,
  Music,
  Gauge,
  ZoomIn,
  Save,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { useMultiTrackPlayer } from "@/hooks/useMultiTrackPlayer";
import { usePracticeKeyboard } from "@/hooks/usePracticeKeyboard";
import { TrackLanes, formatTime } from "./TrackLanes";
import { UploadTrackDialog } from "./UploadTrackDialog";
import { EmptyState } from "./EmptyState";
import { updateCustomTrack, deleteCustomTrack } from "@/app/actions/customTracks";
import {
  INSTRUMENT_ROLES,
  ROLE_LABEL,
  DAW_PX_PER_SEC_DEFAULT,
  DAW_PX_PER_SEC_MIN,
  DAW_PX_PER_SEC_MAX,
  SEEK_STEP_S,
} from "@/lib/constants";
import type { Role } from "@/lib/constants";
import type { Song, CustomTrack } from "@/types/models";
import { usePlayerStore } from "@/stores/player-store";

interface TrackStudioProps {
  song: Song;
  tracks: CustomTrack[];
  preferredInstrument: Role;
  onRefresh: () => void;
}

export function TrackStudio({ song, tracks, preferredInstrument, onRefresh }: TrackStudioProps) {
  const [localTracks, setLocalTracks] = useState<CustomTrack[]>(tracks);
  const [mutedTrackIds, setMutedTrackIds] = useState<Set<string>>(new Set());
  const [soloTrackIds, setSoloTrackIds] = useState<Set<string>>(new Set());
  const [pxPerSec, setPxPerSec] = useState(DAW_PX_PER_SEC_DEFAULT);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [isSavingAlignment, setIsSavingAlignment] = useState(false);

  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const speed = usePlayerStore((s) => s.speed);
  const setSpeed = usePlayerStore((s) => s.setSpeed);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const reset = usePlayerStore((s) => s.reset);

  useEffect(() => {
    reset();
    return () => reset();
  }, [reset]);

  useEffect(() => {
    setLocalTracks(tracks);
  }, [tracks]);

  const probedRef = useRef(new Set<string>());

  const player = useMultiTrackPlayer({
    tracks: localTracks,
    mutedTrackIds,
    soloTrackIds,
    getStreamUrl: (id) => `/api/uploads/${id}`,
  });

  usePracticeKeyboard({
    onPlayPause: () => player.playPause(),
    onSeekBackward: () => player.seekBy(-SEEK_STEP_S),
    onSeekForward: () => player.seekBy(SEEK_STEP_S),
  });

  const isDirty = localTracks.some((t) => {
    const saved = tracks.find((tt) => tt.id === t.id);
    return saved && t.startOffset !== saved.startOffset;
  });

  const handleDragEnd = useCallback((trackId: string, newStartOffset: number) => {
    setLocalTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, startOffset: newStartOffset } : t))
    );
  }, []);

  const handleSaveAlignment = useCallback(async () => {
    setIsSavingAlignment(true);
    try {
      const dirty = localTracks.filter((t) => {
        const saved = tracks.find((tt) => tt.id === t.id);
        return saved && t.startOffset !== saved.startOffset;
      });
      for (const t of dirty) {
        const res = await updateCustomTrack(t.id, { startOffset: t.startOffset });
        if (!res.success) {
          toast.error("Failed to save offset for " + t.label);
        }
      }
      toast.success("Alignment saved!");
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save alignment");
    } finally {
      setIsSavingAlignment(false);
    }
  }, [localTracks, tracks, onRefresh]);

  const handleRevertAlignment = useCallback(() => {
    setLocalTracks(tracks);
  }, [tracks]);

  const handleTrackMetadata = useCallback(
    (trackId: string, duration: number) => {
      if (probedRef.current.has(trackId)) return;
      if (!isFinite(duration) || duration <= 0) return;
      probedRef.current.add(trackId);
      updateCustomTrack(trackId, { duration }).then(() => onRefresh());
    },
    [onRefresh]
  );

  const handleRoleChange = useCallback(
    (trackId: string, newRole: Role) => {
      updateCustomTrack(trackId, { role: newRole }).then((res) => {
        if (res.success) {
          onRefresh();
        } else {
          toast.error("Failed to update role");
        }
      });
    },
    [onRefresh]
  );

  const handleLabelBlur = useCallback(
    (trackId: string) => {
      const draft = labelDrafts[trackId];
      if (draft === undefined) return;
      const track = localTracks.find((t) => t.id === trackId);
      if (!track || draft === track.label) {
        setLabelDrafts((prev) => {
          const next = { ...prev };
          delete next[trackId];
          return next;
        });
        return;
      }
      updateCustomTrack(trackId, { label: draft }).then((res) => {
        if (res.success) {
          onRefresh();
        } else {
          toast.error("Failed to update label");
        }
      });
      setLabelDrafts((prev) => {
        const next = { ...prev };
        delete next[trackId];
        return next;
      });
    },
    [labelDrafts, localTracks, onRefresh]
  );

  const handleDeleteTrack = useCallback(
    (trackId: string) => {
      if (!confirm("Delete this track?")) return;
      deleteCustomTrack(trackId).then((res) => {
        if (res.success) {
          setMutedTrackIds((prev) => {
            const next = new Set(prev);
            next.delete(trackId);
            return next;
          });
          setSoloTrackIds((prev) => {
            const next = new Set(prev);
            next.delete(trackId);
            return next;
          });
          onRefresh();
          toast.success("Track deleted");
        } else {
          toast.error("Failed to delete track");
        }
      });
    },
    [onRefresh]
  );

  function toggleMute(trackId: string) {
    setMutedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }

  function toggleSolo(trackId: string) {
    setSoloTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }

  function handleStop() {
    setPlaying(false);
    player.seekTo(0);
  }

  const isPlaying = player.isPlaying;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-border pb-5">
        <Link
          href={`/songs/${song.id}`}
          className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card rounded-xl w-10 h-10 transition-all border border-transparent hover:border-border"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-lg font-black text-foreground">Track Studio</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {song.title} by {song.artist}
          </p>
        </div>
      </div>

      {/* Section 1: Tracks */}
      <Card className="border-border bg-card/40 rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-foreground">
              Tracks ({localTracks.length})
            </CardTitle>
            <Button
              onClick={() => setUploadDialogOpen(true)}
              className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl font-bold flex items-center gap-1.5 h-8"
            >
              <Plus className="w-3.5 h-3.5" /> Add Track
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {localTracks.length === 0 ? (
            <EmptyState
              icon={Music}
              title="No Custom Tracks"
              description="Upload audio or video stems for this song to align and practice with them."
              action={
                <Button
                  onClick={() => setUploadDialogOpen(true)}
                  className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl font-bold flex items-center gap-1.5 mx-auto"
                >
                  <Plus className="w-4 h-4" /> Upload First Track
                </Button>
              }
            />
          ) : (
            localTracks.map((track) => (
              <div
                key={track.id}
                className="p-4 bg-background/60 border border-border rounded-xl space-y-2.5"
              >
                {/* Row 1: File */}
                <div className="flex items-center gap-2">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-12 flex-shrink-0">
                    File
                  </label>
                  <span className="text-sm text-foreground truncate flex-1 min-w-0">
                    {track.fileName}
                  </span>
                  <span className="text-sm text-foreground font-mono flex-shrink-0">
                    {track.duration != null ? formatTime(track.duration) : "--:--"}
                  </span>
                  <button
                    onClick={() => handleDeleteTrack(track.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border bg-background border-border text-muted-foreground hover:text-red-400 hover:bg-red-950/20 flex-shrink-0"
                    title="Delete track"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Row 2: Name */}
                <div className="flex items-center gap-2">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-12 flex-shrink-0">
                    Name
                  </label>
                  <Input
                    value={labelDrafts[track.id] ?? track.label}
                    onChange={(e) =>
                      setLabelDrafts((prev) => ({ ...prev, [track.id]: e.target.value }))
                    }
                    onBlur={() => handleLabelBlur(track.id)}
                    className="bg-background border-border text-foreground text-sm rounded-lg h-9 flex-1"
                  />
                </div>

                {/* Row 3: Role */}
                <div className="flex items-center gap-2">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-12 flex-shrink-0">
                    Role
                  </label>
                  <select
                    value={track.role}
                    onChange={(e) => handleRoleChange(track.id, e.target.value as Role)}
                    className="bg-background border border-border text-foreground focus:ring-1 focus:ring-ring focus:border-[#5b80a5] rounded-lg px-2.5 text-sm focus:outline-none h-9 flex-1"
                  >
                    {INSTRUMENT_ROLES.map((r) => (
                      <option key={r} value={r} className="bg-card">
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Section 2: Arrange */}
      {localTracks.length > 0 && (
        <Card className="border-border bg-card/40 rounded-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                <Music className="w-4 h-4 text-muted-foreground" />
                Arrange
              </CardTitle>
              <div className="flex items-center gap-2">
                {isDirty && (
                  <Button
                    onClick={handleRevertAlignment}
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl border border-border h-8 text-xs font-bold flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3 h-3" /> Revert
                  </Button>
                )}
                <Button
                  onClick={handleSaveAlignment}
                  disabled={isSavingAlignment || !isDirty}
                  className={cn(
                    "h-8 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all duration-300",
                    isDirty && !isSavingAlignment
                      ? "bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse"
                      : "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground"
                  )}
                >
                  {isSavingAlignment ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-3 h-3" /> Save Alignment
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Transport bar */}
            <div className="flex items-center gap-3">
              <Button
                onClick={player.playPause}
                className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl h-10 w-10 p-0 flex items-center justify-center flex-shrink-0"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <Button
                onClick={handleStop}
                variant="ghost"
                className="bg-background border border-border text-muted-foreground hover:text-foreground rounded-xl h-10 w-10 p-0 flex items-center justify-center flex-shrink-0"
                title="Stop"
              >
                <Square className="w-3.5 h-3.5" />
              </Button>

              <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                {formatTime(player.currentT)} / {formatTime(player.duration)}
              </span>
            </div>

            {/* Timeline */}
            <TrackLanes
              tracks={localTracks}
              pxPerSec={pxPerSec}
              currentT={player.currentT}
              mutedTrackIds={mutedTrackIds}
              soloTrackIds={soloTrackIds}
              interactive
              onDragEnd={handleDragEnd}
              onRulerSeek={(T) => player.seekTo(T)}
              onToggleMute={toggleMute}
              onToggleSolo={toggleSolo}
              onZoomChange={setPxPerSec}
              onTrackMetadata={handleTrackMetadata}
              registerRef={player.registerRef}
              getStreamUrl={(id) => `/api/uploads/${id}`}
            />
            <p className="text-[10px] text-muted-foreground">
              Drag clips left/right to align. Click or drag the ruler to seek. Ctrl+scroll to zoom. Use mute/solo per row to isolate tracks while checking sync. Save Alignment to persist changes for everyone.
            </p>

            {/* Sliders */}
            <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border">
              {/* Volume */}
              <div className="flex items-center gap-3 bg-background/40 border border-border px-3.5 py-2 rounded-xl flex-1 min-w-[160px]">
                <button
                  onClick={() => setVolume(volume === 0 ? 100 : 0)}
                  className="text-[#acd1f8] hover:text-white transition-colors cursor-pointer border-0 bg-transparent p-0 flex items-center"
                >
                  {volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
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
              <div className="flex items-center gap-3 bg-background/40 border border-border px-3.5 py-2 rounded-xl flex-1 min-w-[160px]">
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

              {/* Zoom */}
              <div className="flex items-center gap-3 bg-background/40 border border-border px-3.5 py-2 rounded-xl flex-1 min-w-[160px]">
                <span className="text-[#acd1f8] flex items-center">
                  <ZoomIn className="w-3.5 h-3.5" />
                </span>
                <div className="flex flex-col flex-1">
                  <div className="flex items-center justify-between text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5">
                    <span>Zoom</span>
                    <span className="text-[#acd1f8] font-mono">{Math.round(((pxPerSec - DAW_PX_PER_SEC_MIN) / (DAW_PX_PER_SEC_MAX - DAW_PX_PER_SEC_MIN)) * 100)}%</span>
                  </div>
                  <Slider
                    value={[pxPerSec]}
                    onValueChange={(val) => setPxPerSec(Array.isArray(val) ? val[0] : val)}
                    min={DAW_PX_PER_SEC_MIN}
                    max={DAW_PX_PER_SEC_MAX}
                    step={5}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <UploadTrackDialog
        songId={song.id}
        isOpen={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onUploaded={() => onRefresh()}
        defaultRole={preferredInstrument}
      />
    </div>
  );
}
