"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Image as ImageIcon,
  FileText,
} from "lucide-react";
import { useMultiTrackPlayer } from "@/hooks/useMultiTrackPlayer";
import { usePracticeKeyboard } from "@/hooks/usePracticeKeyboard";
import { TrackLanes, formatTime } from "./TrackLanes";
import { UploadTrackDialog } from "./UploadTrackDialog";
import { EmptyState } from "./EmptyState";
import { updateOriginalMetadata } from "@/app/actions/songs";
import { updateCustomTrack, deleteCustomTrack } from "@/app/actions/customTracks";
import { saveScratchpadNotes } from "@/app/actions/user";
import {
  INSTRUMENT_ROLES,
  ROLE_LABEL,
  ROLE_COLORS,
  DAW_PX_PER_SEC_DEFAULT,
  DAW_PX_PER_SEC_MIN,
  DAW_PX_PER_SEC_MAX,
  SEEK_STEP_S,
} from "@/lib/constants";
import { normalizeTuning } from "@/lib/tunings";
import type { Role } from "@/lib/constants";
import type { Song, CustomTrack } from "@/types/models";
import { usePlayerStore } from "@/stores/player-store";

interface OriginalEditorProps {
  song: Song;
  tracks: CustomTrack[];
  preferredInstrument: Role;
  initialScratchpadNotes: string;
  onRefresh: () => void;
}

export function OriginalEditor({
  song,
  tracks,
  preferredInstrument,
  initialScratchpadNotes,
  onRefresh,
}: OriginalEditorProps) {
  const router = useRouter();

  // --- Draft state (metadata) ---
  const [titleDraft, setTitleDraft] = useState(song.title);
  const [artistDraft, setArtistDraft] = useState(song.artist);
  const [tuningsDraft, setTuningsDraft] = useState<Record<string, string>>(song.tunings ?? {});
  const [coverArtFile, setCoverArtFile] = useState<File | null>(null);
  const [coverArtMarkedForRemoval, setCoverArtMarkedForRemoval] = useState(false);
  const [notesDraft, setNotesDraft] = useState(initialScratchpadNotes);

  // --- Draft state (stems) ---
  const [stemDrafts, setStemDrafts] = useState<CustomTrack[]>(tracks);
  const [deletedStemIds, setDeletedStemIds] = useState<Set<string>>(new Set());

  // --- Timeline state ---
  const [mutedTrackIds, setMutedTrackIds] = useState<Set<string>>(new Set());
  const [soloTrackIds, setSoloTrackIds] = useState<Set<string>>(new Set());
  const [pxPerSec, setPxPerSec] = useState(DAW_PX_PER_SEC_DEFAULT);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  // Keep drafts in sync when server data refreshes (e.g. after upload).
  useEffect(() => {
    setStemDrafts((prev) => {
      const serverIds = new Set(tracks.map((t) => t.id));
      // Preserve draft edits (role, label, startOffset) for stems that still exist,
      // but update duration from server (probed value).
      const preserved = prev
        .filter((t) => serverIds.has(t.id))
        .map((t) => {
          const server = tracks.find((tt) => tt.id === t.id);
          return server ? { ...t, duration: server.duration } : t;
        });
      const newOnes = tracks.filter((t) => !preserved.some((p) => p.id === t.id));
      return [...preserved, ...newOnes];
    });
    // Clean up deleted IDs that no longer exist on the server (already deleted).
    setDeletedStemIds((prev) => {
      const next = new Set(prev);
      for (const id of next) {
        if (!serverIds_has(tracks, id)) next.delete(id);
      }
      return next;
    });
  }, [tracks]);

  const probedRef = useRef(new Set<string>());

  const activeStems = useMemo(
    () => stemDrafts.filter((t) => !deletedStemIds.has(t.id)),
    [stemDrafts, deletedStemIds]
  );

  const player = useMultiTrackPlayer({
    tracks: activeStems,
    mutedTrackIds,
    soloTrackIds,
    getStreamUrl: (id) => `/api/uploads/${id}`,
  });

  usePracticeKeyboard({
    onPlayPause: () => player.playPause(),
    onSeekBackward: () => player.seekBy(-SEEK_STEP_S),
    onSeekForward: () => player.seekBy(SEEK_STEP_S),
  });

  // --- Dirty detection ---
  const metaDirty =
    titleDraft !== song.title ||
    artistDraft !== song.artist ||
    JSON.stringify(tuningsDraft) !== JSON.stringify(song.tunings ?? {}) ||
    coverArtFile !== null ||
    coverArtMarkedForRemoval ||
    notesDraft !== initialScratchpadNotes;

  const stemsDirty = stemDrafts.some((t) => {
    const saved = tracks.find((tt) => tt.id === t.id);
    if (!saved) return false;
    return (
      t.startOffset !== saved.startOffset ||
      t.role !== saved.role ||
      t.label !== saved.label
    );
  }) || deletedStemIds.size > 0;

  const isDirty = metaDirty || stemsDirty;

  // --- Tuning roles to show ---
  // Tuning only for Guitar and Bass
  const hasGuitarStems = useMemo(() => activeStems.some((t) => t.role === "Guitar"), [activeStems]);
  const hasBassStems = useMemo(() => activeStems.some((t) => t.role === "Bass"), [activeStems]);

  // --- Cover art preview ---
  const coverArtPreview = coverArtFile
    ? URL.createObjectURL(coverArtFile)
    : coverArtMarkedForRemoval
      ? null
      : song.coverArtStoredName
        ? `/api/cover-art/${song.id}?v=${song.coverArtStoredName}`
        : song.albumArt
          ? song.albumArt
          : null;

  // --- Handlers ---
  const handleDragEnd = useCallback((trackId: string, newStartOffset: number) => {
    setStemDrafts((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, startOffset: newStartOffset } : t))
    );
  }, []);

  const handleTrackMetadata = useCallback(
    (trackId: string, duration: number) => {
      if (probedRef.current.has(trackId)) return;
      if (!isFinite(duration) || duration <= 0) return;
      probedRef.current.add(trackId);
      // Update local draft immediately so the UI shows the correct duration
      setStemDrafts((prev) =>
        prev.map((t) => (t.id === trackId ? { ...t, duration } : t))
      );
      updateCustomTrack(trackId, { duration }).then(() => onRefresh());
    },
    [onRefresh]
  );

  const handleStemRoleChange = useCallback((trackId: string, newRole: Role) => {
    setStemDrafts((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, role: newRole } : t))
    );
  }, []);

  const handleStemLabelChange = useCallback((trackId: string, newLabel: string) => {
    setStemDrafts((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, label: newLabel } : t))
    );
  }, []);

  const handleStemDelete = useCallback((trackId: string) => {
    setDeletedStemIds((prev) => new Set(prev).add(trackId));
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
  }, []);

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

  function handleBack() {
    if (isDirty) {
      if (!confirm("You have unsaved changes. Leave anyway?")) return;
    }
    router.push(`/songs/${song.id}`);
  }

  function handleDiscard() {
    setTitleDraft(song.title);
    setArtistDraft(song.artist);
    setTuningsDraft(song.tunings ?? {});
    setCoverArtFile(null);
    setCoverArtMarkedForRemoval(false);
    setNotesDraft(initialScratchpadNotes);
    setStemDrafts(tracks);
    setDeletedStemIds(new Set());
  }

  async function handleSaveAll() {
    setIsSaving(true);
    try {
      // 1. Metadata
      const metaPatch: { title?: string; artist?: string; tunings?: Record<string, string> | null; coverArtStoredName?: string | null } = {};
      if (titleDraft !== song.title) { metaPatch.title = titleDraft; metaPatch.artist = artistDraft; }
      if (artistDraft !== song.artist && !metaPatch.artist) { metaPatch.artist = artistDraft; }
      if (JSON.stringify(tuningsDraft) !== JSON.stringify(song.tunings ?? {})) {
        metaPatch.tunings = Object.keys(tuningsDraft).length > 0 ? tuningsDraft : null;
      }
      if (coverArtMarkedForRemoval) {
        metaPatch.coverArtStoredName = null;
      }
      if (Object.keys(metaPatch).length > 0) {
        const res = await updateOriginalMetadata(song.id, metaPatch);
        if (!res.success) {
          toast.error("Failed to save metadata: " + res.error);
          return;
        }
      }

      // 2. Cover art upload (if a new file was selected)
      if (coverArtFile) {
        const form = new FormData();
        form.append("songId", song.id);
        form.append("file", coverArtFile);
        const res = await fetch("/api/cover-art", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error("Cover art upload failed: " + (data.error || res.statusText));
          return;
        }
      }
      // Reset cover-art draft state regardless of whether we uploaded or removed.
      setCoverArtFile(null);
      setCoverArtMarkedForRemoval(false);

      // 3. Stem edits (role, label, startOffset)
      for (const draft of stemDrafts) {
        if (deletedStemIds.has(draft.id)) continue;
        const saved = tracks.find((tt) => tt.id === draft.id);
        if (!saved) continue;
        const patch: Partial<{ role: Role; label: string; startOffset: number }> = {};
        if (draft.role !== saved.role) patch.role = draft.role;
        if (draft.label !== saved.label) patch.label = draft.label;
        if (draft.startOffset !== saved.startOffset) patch.startOffset = draft.startOffset;
        if (Object.keys(patch).length > 0) {
          await updateCustomTrack(draft.id, patch);
        }
      }

      // 4. Deleted stems
      for (const id of deletedStemIds) {
        await deleteCustomTrack(id);
      }

      // 5. Scratchpad notes
      if (notesDraft !== initialScratchpadNotes) {
        await saveScratchpadNotes(song.id, notesDraft);
      }

      toast.success("All changes saved!");
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error("Save failed: " + String(err));
    } finally {
      setIsSaving(false);
    }
  }

  const isPlaying = player.isPlaying;

  // Group active stems by role for display
  const stemsByRole = useMemo(() => {
    const groups: Record<string, CustomTrack[]> = {};
    for (const stem of activeStems) {
      (groups[stem.role] ??= []).push(stem);
    }
    return groups;
  }, [activeStems]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border pb-5">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="text-muted-foreground hover:text-foreground hover:bg-card rounded-xl w-10 h-10 p-0 border border-transparent hover:border-border"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black text-foreground">Edit Original</h2>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {song.title} by {song.artist}
          </p>
        </div>
        {isDirty && (
          <Button
            onClick={handleDiscard}
            disabled={isSaving}
            variant="ghost"
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl border border-border h-9 text-xs font-bold flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Discard
          </Button>
        )}
        <Button
          onClick={handleSaveAll}
          disabled={isSaving || !isDirty}
          className={cn(
            "h-9 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all duration-300",
            isDirty && !isSaving
              ? "bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse"
              : "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground"
          )}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" /> Save All
            </>
          )}
        </Button>
      </div>

      {/* Song Metadata */}
      <Card className="border-border bg-card/40 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <Music className="w-4 h-4 text-muted-foreground" /> Song Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            {/* Cover art */}
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="w-24 h-24 rounded-xl border border-border overflow-hidden flex items-center justify-center bg-muted/30">
                {coverArtPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverArtPreview} alt="Cover art" className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex gap-1.5">
                <label className="text-[10px] font-bold text-[#acd1f8] hover:text-foreground cursor-pointer bg-btn-bg hover:bg-btn-hover border border-dialog-border rounded-lg px-2 py-1 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" /> Browse
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setCoverArtFile(f);
                        setCoverArtMarkedForRemoval(false);
                      }
                    }}
                  />
                </label>
                {coverArtPreview && (
                  <button
                    onClick={() => {
                      setCoverArtFile(null);
                      setCoverArtMarkedForRemoval(true);
                    }}
                    className="text-[10px] font-bold text-red-400 hover:text-red-300 hover:bg-red-950/20 cursor-pointer bg-background border border-border rounded-lg px-2 py-1"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Title + Artist */}
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Song Title
                </Label>
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="bg-background border-border text-foreground rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Artist / Band Name
                </Label>
                <Input
                  value={artistDraft}
                  onChange={(e) => setArtistDraft(e.target.value)}
                  className="bg-background border-border text-foreground rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Tunings — only for Guitar and Bass */}
          {(hasGuitarStems || hasBassStems) && (
            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Instrument Tunings
              </Label>
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    hasGuitarStems && ("Guitar" as const),
                    hasBassStems && ("Bass" as const),
                  ].filter(Boolean) as ("Guitar" | "Bass")[]
                ).map((role) => (
                  <div key={role} className="flex items-center gap-2">
                    <span className={cn("text-[9px] font-bold text-white px-2 py-1 rounded-lg", ROLE_COLORS[role])}>
                      {ROLE_LABEL[role]}
                    </span>
                    <Input
                      value={tuningsDraft[role] ?? ""}
                      onChange={(e) =>
                        setTuningsDraft((prev) => {
                          const next = { ...prev };
                          if (e.target.value) next[role] = e.target.value;
                          else delete next[role];
                          return next;
                        })
                      }
                      onBlur={(e) => {
                        const val = e.target.value.trim();
                        if (!val) return;
                        const normalized = normalizeTuning(val);
                        if (normalized) {
                          setTuningsDraft((prev) => {
                            const next = { ...prev };
                            next[role] = normalized;
                            return next;
                          });
                        } else {
                          // Invalid — revert to previous or clear
                          setTuningsDraft((prev) => {
                            const next = { ...prev };
                            if (song.tunings?.[role]) next[role] = song.tunings[role];
                            else delete next[role];
                            return next;
                          });
                          toast.error(`Invalid tuning notes. Use dash-separated notes like E-A-D-G-B-E`);
                        }
                      }}
                      placeholder="e.g. E-A-D-G-B-E"
                      className="bg-background border-border text-foreground font-mono text-xs rounded-lg w-32 h-8"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes Scratchpad */}
      <Card className="border-border bg-card/40 rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" /> Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Jot down arrangement ideas, key changes, section notes..."
            className="w-full min-h-[100px] bg-background border border-border text-foreground text-sm rounded-xl p-3 resize-y focus:outline-none focus:border-[#5b80a5]"
          />
        </CardContent>
      </Card>

      {/* Stems */}
      <Card className="border-border bg-card/40 rounded-2xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-foreground">
              Stems ({activeStems.length})
            </CardTitle>
            <Button
              onClick={() => setUploadDialogOpen(true)}
              className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl font-bold flex items-center gap-1.5 h-8"
            >
              <Plus className="w-3.5 h-3.5" /> Add Stem
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeStems.length === 0 ? (
            <EmptyState
              icon={Music}
              title="No Stems"
              description="Upload audio or video stems to build your original song."
              action={
                <Button
                  onClick={() => setUploadDialogOpen(true)}
                  className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl font-bold flex items-center gap-1.5 mx-auto"
                >
                  <Plus className="w-4 h-4" /> Upload First Stem
                </Button>
              }
            />
          ) : (
            INSTRUMENT_ROLES.filter((r) => (stemsByRole[r] ?? []).length > 0).map((role) => (
              <div key={role} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[9px] font-bold text-white px-2 py-0.5 rounded-md", ROLE_COLORS[role])}>
                    {ROLE_LABEL[role]}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {(stemsByRole[role] ?? []).length} stem{(stemsByRole[role] ?? []).length === 1 ? "" : "s"}
                  </span>
                </div>
                {(stemsByRole[role] ?? []).map((track) => (
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
                        onClick={() => handleStemDelete(track.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border bg-background border-border text-muted-foreground hover:text-red-400 hover:bg-red-950/20 flex-shrink-0"
                        title="Delete stem (applies on Save)"
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
                        value={track.label}
                        onChange={(e) => handleStemLabelChange(track.id, e.target.value)}
                        placeholder="Label"
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
                        onChange={(e) => handleStemRoleChange(track.id, e.target.value as Role)}
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
                ))}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Arrange / Timeline */}
      {activeStems.length > 0 && (
        <Card className="border-border bg-card/40 rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Music className="w-4 h-4 text-muted-foreground" /> Arrange
            </CardTitle>
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
              tracks={activeStems}
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
              Drag clips left/right to align. Click or drag the ruler to seek. Ctrl+scroll to zoom. Changes are draft until Save All.
            </p>

            {/* Sliders */}
            <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border">
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

function serverIds_has(tracks: CustomTrack[], id: string): boolean {
  return tracks.some((t) => t.id === id);
}