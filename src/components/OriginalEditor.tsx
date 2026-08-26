"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn, uuid } from "@/lib/utils";
import { toast } from "sonner";
import {
  Play,
  Pause,
  Square,
  Plus,
  Trash2,
  ArrowLeft,
  Music,
  ZoomIn,
  Image as ImageIcon,
  FileText,
} from "lucide-react";
import { useMultiTrackPlayer } from "@/hooks/useMultiTrackPlayer";
import { usePracticeKeyboard } from "@/hooks/usePracticeKeyboard";
import { formatTime } from "@/lib/utils";
import { TrackLanes } from "./TrackLanes";
import { UploadTrackDialog } from "./UploadTrackDialog";
import { EmptyState } from "./EmptyState";
import { getCoverArtUrl } from "./CoverArt";
import { VolumeSpeedControls } from "./VolumeSpeedControls";
import { updateOriginalMetadata } from "@/app/actions/songs";
import { updateCustomTrack, deleteCustomTrack } from "@/app/actions/customTracks";
import { saveScratchpadNotes } from "@/app/actions/user";
import { readDeviceVolumeClient, readDeviceSpeedClient, writeDeviceVolume, writeDeviceSpeed } from "@/lib/device-media";
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
import { useSaveBar } from "@/hooks/use-save-bar";
import { navigateWithGuard } from "@/stores/save-bar-store";

function tuningsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

function CoverArtFields({
  preview,
  onSelect,
  onRemove,
}: {
  preview: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 flex-shrink-0">
      <div className="w-24 h-24 rounded-xl border border-border overflow-hidden flex items-center justify-center bg-muted/30">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Cover art" className="w-full h-full object-cover" />
        ) : (
          <Music className="w-8 h-8 text-muted-foreground" />
        )}
      </div>
      <div className="flex gap-1.5">
        <label className="text-[10px] font-bold text-accent-text hover:text-foreground cursor-pointer bg-btn-bg hover:bg-btn-hover border border-dialog-border rounded-lg px-2 py-1 flex items-center gap-1">
          <ImageIcon className="w-3 h-3" /> Browse
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSelect(f);
            }}
          />
        </label>
        {preview && (
          <button
            onClick={onRemove}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-destructive hover:bg-destructive/10 bg-background border border-destructive/30 rounded-lg px-2 py-1"
          >
            <Trash2 className="w-3 h-3" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

function StemRow({
  track,
  onDelete,
  onLabelChange,
  onRoleChange,
}: {
  track: CustomTrack;
  onDelete: (id: string) => void;
  onLabelChange: (id: string, label: string) => void;
  onRoleChange: (id: string, role: Role) => void;
}) {
  return (
    <div className="p-4 bg-background/60 border border-border rounded-xl space-y-2.5">
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
          onClick={() => onDelete(track.id)}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-all border bg-background border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 flex-shrink-0"
          title="Delete stem (applies on Save)"
          aria-label="Delete stem"
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
          onChange={(e) => onLabelChange(track.id, e.target.value)}
          placeholder="Label"
          className="bg-background border-border text-foreground text-sm rounded-lg h-9 flex-1"
        />
      </div>

      {/* Row 3: Role */}
      <div className="flex items-center gap-2">
        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider w-12 flex-shrink-0">
          Role
        </label>
        <Select
          value={track.role}
          onChange={(e) => onRoleChange(track.id, e.target.value as Role)}
          className="flex-1"
        >
          {INSTRUMENT_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

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

  // Pending stems — files selected in UploadTrackDialog that haven't been uploaded yet.
  // They show as drafts in the list and are uploaded on Save All.
  const pendingFilesRef = useRef<Map<string, File>>(new Map());
  const blobUrlsRef = useRef<Map<string, string>>(new Map());
  const [pendingStemIds, setPendingStemIds] = useState<Set<string>>(new Set());

  // --- Timeline state ---
  const [mutedTrackIds, setMutedTrackIds] = useState<Set<string>>(new Set());
  const [soloTrackIds, setSoloTrackIds] = useState<Set<string>>(new Set());
  const [pxPerSec, setPxPerSec] = useState(DAW_PX_PER_SEC_DEFAULT);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Refs to defer clearing cover-art draft state until `song` prop reflects the save.
  // Prevents flicker: keeps the blob URL visible until the new stored name arrives.
  const uploadedCoverArtRef = useRef<string | null>(null);
  const removedCoverArtRef = useRef(false);

  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const speed = usePlayerStore((s) => s.speed);
  const setSpeed = usePlayerStore((s) => s.setSpeed);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const reset = usePlayerStore((s) => s.reset);

  // Device volume/speed live in cookies (see lib/device-media.ts). Hydrate
  // once on mount so the editor matches practice modes; persist changes.
  useEffect(() => {
    setVolume(readDeviceVolumeClient());
    setSpeed(readDeviceSpeedClient());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mediaPersistSkipRef = useRef(true);
  useEffect(() => {
    if (mediaPersistSkipRef.current) {
      mediaPersistSkipRef.current = false;
      return;
    }
    writeDeviceVolume(volume);
    writeDeviceSpeed(speed);
  }, [volume, speed]);

  useEffect(() => {
    reset();
    return () => reset();
  }, [reset]);

  // Keep drafts in sync when server data refreshes (e.g. after upload).
  useEffect(() => {
    const serverIds = new Set(tracks.map((t) => t.id));
    setStemDrafts((prev) => {
      // Preserve draft edits (role, label, startOffset) for stems that still exist,
      // but update duration from server (probed value).
      const preserved = prev
        .filter((t) => serverIds.has(t.id) || pendingStemIds.has(t.id))
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
        if (!serverIds.has(id)) next.delete(id);
      }
      return next;
    });
  }, [tracks, pendingStemIds]);

  // Clear cover-art draft state only after `song` prop reflects the saved value.
  // This prevents flicker: the blob URL remains visible until the new stored name arrives.
  useEffect(() => {
    if (uploadedCoverArtRef.current && song.coverArtStoredName === uploadedCoverArtRef.current) {
      setCoverArtFile(null);
      uploadedCoverArtRef.current = null;
    }
    if (removedCoverArtRef.current && song.coverArtStoredName === null) {
      setCoverArtMarkedForRemoval(false);
      removedCoverArtRef.current = false;
    }
  }, [song.coverArtStoredName]);

  const probedRef = useRef(new Set<string>());

  const activeStems = useMemo(
    () => stemDrafts.filter((t) => !deletedStemIds.has(t.id)),
    [stemDrafts, deletedStemIds]
  );

  const player = useMultiTrackPlayer({
    tracks: activeStems,
    mutedTrackIds,
    soloTrackIds,
  });

  const getStreamUrlForTrack = useCallback((id: string) => {
    const file = pendingFilesRef.current.get(id);
    if (file) {
      if (!blobUrlsRef.current.has(id)) {
        blobUrlsRef.current.set(id, URL.createObjectURL(file));
      }
      return blobUrlsRef.current.get(id)!;
    }
    return `/api/uploads/${id}`;
  }, []);

  // Revoke any leftover pending-stem blob URLs on unmount (leaving via Back
  // skips the Discard/Save cleanup paths). Consuming paths delete entries as
  // they use them, so this only sees genuinely unreleased URLs.
  useEffect(() => {
    const urls = blobUrlsRef.current; // same Map instance for the component's lifetime
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  usePracticeKeyboard({
    onPlayPause: () => player.playPause(),
    onSeekBackward: () => player.seekBy(-SEEK_STEP_S),
    onSeekForward: () => player.seekBy(SEEK_STEP_S),
  });

  // --- Dirty detection ---
  const metaDirty =
    titleDraft !== song.title ||
    artistDraft !== song.artist ||
    !tuningsEqual(tuningsDraft, song.tunings ?? {}) ||
    coverArtFile !== null ||
    coverArtMarkedForRemoval ||
    notesDraft !== initialScratchpadNotes;

  const stemsDirty = stemDrafts.some((t) => {
    // Pending stems (not yet uploaded) always count as dirty.
    if (pendingStemIds.has(t.id)) return true;
    const saved = tracks.find((tt) => tt.id === t.id);
    if (!saved) return false;
    return (
      t.startOffset !== saved.startOffset ||
      t.role !== saved.role ||
      t.label !== saved.label
    );
  }) || deletedStemIds.size > 0;

  const isDirty = metaDirty || stemsDirty;

  useSaveBar("original-editor", {
    label: "Original song editor",
    isDirty,
    isSaving,
    onSave: handleSaveAll,
    onRevert: handleDiscard,
  });

  // --- Tuning roles to show ---
  // Tuning only for Guitar and Bass
  const hasGuitarStems = useMemo(() => activeStems.some((t) => t.role === "Guitar"), [activeStems]);
  const hasBassStems = useMemo(() => activeStems.some((t) => t.role === "Bass"), [activeStems]);

  // --- Cover art preview ---
  // Object URL created in an effect (and revoked on change/unmount) — creating
  // it in the render body leaked a new URL per render while a file was selected.
  const [coverArtBlobUrl, setCoverArtBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!coverArtFile) {
      setCoverArtBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(coverArtFile);
    setCoverArtBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [coverArtFile]);

  const coverArtPreview = coverArtBlobUrl
    ? coverArtBlobUrl
    : coverArtMarkedForRemoval
      ? null
      : getCoverArtUrl(song);

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
      // Only persist duration to server for non-pending stems
      if (!pendingStemIds.has(trackId)) {
        updateCustomTrack(trackId, { duration })
          .then(() => onRefresh())
          .catch((e) => console.error("Failed to save track duration:", e));
      }
    },
    [onRefresh, pendingStemIds]
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

  const handleStemDelete = useCallback(
    (trackId: string) => {
      if (pendingStemIds.has(trackId)) {
        // Pending stem (file selected, not yet uploaded): drop the draft
        // entirely instead of marking it deleted — otherwise Save All would
        // still upload it (step 3b) and then deleteCustomTrack(trackId) would
        // no-op against a temp id, resurrecting the stem in the library.
        setStemDrafts((prev) => prev.filter((t) => t.id !== trackId));
        setPendingStemIds((prev) => {
          const next = new Set(prev);
          next.delete(trackId);
          return next;
        });
        const url = blobUrlsRef.current.get(trackId);
        if (url) URL.revokeObjectURL(url);
        blobUrlsRef.current.delete(trackId);
        pendingFilesRef.current.delete(trackId);
        return;
      }
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
    },
    [pendingStemIds]
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

  function handleBack() {
    navigateWithGuard(() => router.push(`/songs/${song.id}`));
  }

  function handleDiscard() {
    // Clean up pending stems (revoke blob URLs, discard file refs).
    for (const id of pendingStemIds) {
      const url = blobUrlsRef.current.get(id);
      if (url) URL.revokeObjectURL(url);
      pendingFilesRef.current.delete(id);
    }
    blobUrlsRef.current.clear();
    setPendingStemIds(new Set());
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
      if (titleDraft !== song.title) metaPatch.title = titleDraft;
      if (artistDraft !== song.artist) metaPatch.artist = artistDraft;
      if (!tuningsEqual(tuningsDraft, song.tunings ?? {})) {
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
        const data = await res.json();
        uploadedCoverArtRef.current = data.storedName;
        // ponytail: don't clear coverArtFile yet — keep blob URL visible until song prop updates.
      }
      // 2b. Cover art removal
      if (coverArtMarkedForRemoval) {
        removedCoverArtRef.current = true;
        // ponytail: don't clear coverArtMarkedForRemoval yet — keep null preview until song prop updates.
      }

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
          const res = await updateCustomTrack(draft.id, patch);
          if (!res.success) throw new Error(res.error ?? "Stem update failed");
        }
      }

      // 3b. Upload pending stems (deferred from UploadTrackDialog)
      for (const draft of stemDrafts) {
        if (!pendingStemIds.has(draft.id)) continue;
        const file = pendingFilesRef.current.get(draft.id);
        if (!file) continue;
        const form = new FormData();
        form.append("songId", song.id);
        form.append("role", draft.role);
        form.append("label", draft.label);
        form.append("file", file);
        form.append("kind", "stem");
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Stem upload failed (${res.status})`);
        }
        const data = await res.json();
        const realTrack = data.track as CustomTrack;
        // Replace pending ID with real track ID in drafts
        setStemDrafts((prev) =>
          prev.map((t) =>
            t.id === draft.id
              ? { ...realTrack, role: draft.role, label: draft.label, startOffset: draft.startOffset, duration: t.duration ?? realTrack.duration }
              : t
          )
        );
        pendingFilesRef.current.delete(draft.id);
        const blobUrl = blobUrlsRef.current.get(draft.id);
        if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrlsRef.current.delete(draft.id); }
      }
      setPendingStemIds(new Set());

      // 4. Deleted stems
      for (const id of deletedStemIds) {
        const res = await deleteCustomTrack(id);
        if (!res.success) throw new Error(res.error ?? "Stem deletion failed");
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
          title="Back to song details"
          aria-label="Back to song details"
          className="text-muted-foreground hover:text-foreground hover:bg-card rounded-xl w-10 h-10 p-0 border border-transparent hover:border-border"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-heading font-bold text-foreground">Edit Original</h2>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {song.title} by {song.artist}
          </p>
        </div>
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
            <CoverArtFields
              preview={coverArtPreview}
              onSelect={(f) => {
                setCoverArtFile(f);
                setCoverArtMarkedForRemoval(false);
              }}
              onRemove={() => {
                setCoverArtFile(null);
                setCoverArtMarkedForRemoval(true);
              }}
            />

            {/* Title + Artist */}
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="originalTitle" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Song Title
                </Label>
                <Input
                  id="originalTitle"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  className="bg-background border-border text-foreground rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="originalArtist" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Artist / Band Name
                </Label>
                <Input
                  id="originalArtist"
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
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Instrument Tunings
              </span>
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
          <Textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Jot down arrangement ideas, key changes, section notes..."
            className="min-h-[100px] resize-y"
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
                  <StemRow
                    key={track.id}
                    track={track}
                    onDelete={handleStemDelete}
                    onLabelChange={handleStemLabelChange}
                    onRoleChange={handleStemRoleChange}
                  />
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
              getStreamUrl={getStreamUrlForTrack}
            />
            <p className="text-[10px] text-muted-foreground">
              Drag clips left/right to align. Click or drag the ruler to seek. Ctrl+scroll to zoom. Changes are draft until Save All.
            </p>

            {/* Sliders */}
            <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border">
              <VolumeSpeedControls
                volume={volume}
                onVolumeChange={setVolume}
                speed={speed}
                onSpeedChange={setSpeed}
                blockClassName="flex-1 min-w-[160px]"
              />

              <div className="flex items-center gap-3 bg-background/40 border border-border px-3.5 py-2 rounded-xl flex-1 min-w-[160px]">
                <span className="text-accent-text flex items-center">
                  <ZoomIn className="w-3.5 h-3.5" />
                </span>
                <div className="flex flex-col flex-1">
                  <div className="flex items-center justify-between text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-1.5">
                    <span>Zoom</span>
                    <span className="text-accent-text font-mono">{Math.round(((pxPerSec - DAW_PX_PER_SEC_MIN) / (DAW_PX_PER_SEC_MAX - DAW_PX_PER_SEC_MIN)) * 100)}%</span>
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
        isOpen={uploadDialogOpen}
        onClose={() => setUploadDialogOpen(false)}
        onUploaded={(file, role, label) => {
          const tempId = `pending-${uuid()}`;
          const now = Date.now();
          const draftTrack: CustomTrack = {
            id: tempId,
            songId: song.id,
            role,
            label,
            fileName: file.name,
            storedName: "",
            mimeType: file.type,
            sizeBytes: file.size,
            duration: null,
            startOffset: 0,
            isVideo: file.type.startsWith('video/'),
            createdAt: now,
          };
          pendingFilesRef.current.set(tempId, file);
          setStemDrafts((prev) => [...prev, draftTrack]);
          setPendingStemIds((prev) => new Set(prev).add(tempId));
        }}
        defaultRole={preferredInstrument}
      />
    </div>
  );
}