"use client";

import { useState, useEffect, useRef } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn, getAlternativeLinks } from "@/lib/utils";
import { toast } from "sonner";
import { useSaveBar } from "@/hooks/use-save-bar";
import {
  updateRoleGroupVideo,
  updateRoleGroupCustomArtifact,
  removeRoleGroupCustomArtifact,
  lazyLoadTrackMedia,
  refreshSongMetadata,
} from "@/app/actions/songs";
import { useSongProgress } from "@/hooks/useSongProgress";
import { VideoSelector, type MediaDraft } from "./VideoSelector";
import { YouTubePreview } from "./YouTubePreview";
import { CustomMediaPreview } from "./CustomMediaPreview";
import { PracticeLogCard } from "./PracticeLogCard";
import { PracticeButton } from "./PracticeButton";
import { getCoverArtUrl } from "./CoverArt";
import { Music, Play, Video, ExternalLink, Info, Trash2, FileText, Loader2, ChevronDown } from "lucide-react";
import { getYouTubeId } from "@/lib/youtube";
import { NO_VIDEO_SENTINEL } from "@/lib/constants";
import type { Song } from "@/types/models";

interface SongDashboardProps {
  song: Song;
  onRefresh: () => void;
  onDelete?: () => void;
  /** Trash button label — setlist views remove the song instead of deleting it. */
  deleteTitle?: string;
  onPractice?: () => void;
  preferredInstrument?: string;
  activeRole?: string;
  onRoleChange?: (role: string) => void;
}

// Module-scoped set so we only attempt lazy-load once per roleGroup per session.
const attemptedLazy = new Set<string>();
// Module-scoped set so metadata backfill runs once per song per session.
const attemptedMetaBackfill = new Set<string>();

export function SongDashboard({
  song,
  onRefresh,
  onDelete,
  deleteTitle,
  onPractice,
  preferredInstrument,
  activeRole,
  onRoleChange,
}: SongDashboardProps) {
  const [activeTrackId, setActiveTrackId] = useState<string>("");
  const [initializedSongId, setInitializedSongId] = useState<string | null>(null);
  const [videoSelectorState, setVideoSelectorState] = useState<{
    isOpen: boolean;
    trackId: string;
    type: "backing" | "tab";
    instrumentName: string;
  } | null>(null);

  // Staged, unsaved media choices keyed by `${trackId}:${type}`.
  const [mediaDrafts, setMediaDrafts] = useState<Record<string, MediaDraft>>({});
  const [isSavingMedia, setIsSavingMedia] = useState(false);

  function setDraft(key: string, next: MediaDraft | null) {
    setMediaDrafts((prev) => {
      const old = prev[key];
      if (
        old?.kind === "custom" &&
        next?.kind === "custom" &&
        old.previewUrl !== next.previewUrl
      ) {
        URL.revokeObjectURL(old.previewUrl);
      }
      const copy = { ...prev };
      if (next) copy[key] = next;
      else delete copy[key];
      return copy;
    });
  }

  function handleDraftChange(
    trackId: string,
    type: "backing" | "tab",
    currentUrl: string | null,
    currentCustomTrackId: string | null,
    next: MediaDraft | null
  ) {
    const key = `${trackId}:${type}`;
    // Normalizing a YouTube draft back to the persisted value = no-op.
    if (
      next?.kind === "youtube" &&
      !currentCustomTrackId &&
      next.url.trim() === (currentUrl ?? "").trim()
    ) {
      setDraft(key, null);
      return;
    }
    setDraft(key, next);
  }

  function revertMediaDrafts() {
    for (const d of Object.values(mediaDrafts)) {
      if (d.kind === "custom") URL.revokeObjectURL(d.previewUrl);
    }
    setMediaDrafts({});
  }

  async function flushMediaDrafts() {
    setIsSavingMedia(true);
    try {
      for (const [key, draft] of Object.entries(mediaDrafts)) {
        const sep = key.lastIndexOf(":");
        const trackId = key.slice(0, sep);
        const type = key.slice(sep + 1) as "backing" | "tab";
        const rg = song.roleGroups.find((g) => g.id === trackId);
        const boundId = rg
          ? type === "backing"
            ? rg.backingCustomTrackId
            : rg.tabCustomTrackId
          : null;

        if (draft.kind === "youtube") {
          const res = await updateRoleGroupVideo(trackId, type, draft.url.trim() || null);
          if (!res.success) throw new Error(res.error || "Failed to save video link");
          if (boundId) await removeRoleGroupCustomArtifact(trackId, type);
        } else if (draft.kind === "custom") {
          const form = new FormData();
          form.append("songId", song.id);
          form.append("role", rg?.role ?? "Other");
          form.append("label", draft.file.name.replace(/\.[^.]+$/, ""));
          form.append("file", draft.file);
          form.append("kind", "artifact");
          const res = await fetch("/api/uploads", { method: "POST", body: form });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Upload failed (${res.status})`);
          }
          const data = await res.json();
          const bind = await updateRoleGroupCustomArtifact(trackId, type, data.track.id);
          if (!bind.success) throw new Error(bind.error || "Failed to attach file");
        }
        setDraft(key, null);
      }
      toast.success("Media updated");
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save media");
      throw e; // stay dirty so Save can be retried
    } finally {
      setIsSavingMedia(false);
    }
  }

  const hasMediaDrafts = Object.keys(mediaDrafts).length > 0;
  useSaveBar(
    "song-media",
    hasMediaDrafts || isSavingMedia
      ? {
          label: "Backing & tab media",
          isDirty: hasMediaDrafts,
          isSaving: isSavingMedia,
          onSave: flushMediaDrafts,
          onRevert: revertMediaDrafts,
        }
      : null
  );

  // Revoke any leftover blob URLs on unmount.
  useEffect(() => {
    return () => {
      for (const d of Object.values(mediaDrafts)) {
        if (d.kind === "custom") URL.revokeObjectURL(d.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isLazyLoading, setIsLazyLoading] = useState(false);
  const [lazyLoadedTrackId, setLazyLoadedTrackId] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const coverArtUrl = getCoverArtUrl(song);

  const [selectedOtherTrackId, setSelectedOtherTrackId] = useState<string>("");
  const { progress: initialProgress, reload: reloadProgress } = useSongProgress(song.id);

  const [isNotationExpanded, setIsNotationExpanded] = useState<Record<string, boolean>>({});
  const lastPreferredRef = useRef(preferredInstrument);

  // Sync activeTrackId when activeRole prop changes (URL-driven)
  useEffect(() => {
    if (activeRole) {
      const matching = song.roleGroups.find(
        (rg) => rg.role.toLowerCase() === activeRole.toLowerCase()
      );
      if (matching) {
        setActiveTrackId(matching.id);
      } else if (
        activeRole.toLowerCase() === "other" &&
        song.roleGroups.some((rg) => rg.role === "Other")
      ) {
        setActiveTrackId("other-tab");
      }
    }
  }, [activeRole, song.roleGroups]);

  // Smart initialization on song / preference change
  useEffect(() => {
    const standardRoleGroups = song.roleGroups.filter((rg) => rg.role !== "Other");
    const otherRoleGroup = song.roleGroups.find((rg) => rg.role === "Other");
    const otherTracks = otherRoleGroup?.tracks || [];

    if (song.id !== initializedSongId || lastPreferredRef.current !== preferredInstrument) {
      const preferredRole = preferredInstrument || "Guitar";

      if (activeRole) {
        const matching = song.roleGroups.find(
          (rg) => rg.role.toLowerCase() === activeRole.toLowerCase()
        );
        if (matching) {
          setActiveTrackId(matching.id);
          setInitializedSongId(song.id);
          lastPreferredRef.current = preferredInstrument;
          return;
        } else if (activeRole.toLowerCase() === "other" && otherTracks.length > 0) {
          setActiveTrackId("other-tab");
          setSelectedOtherTrackId(otherTracks[0].id);
          setInitializedSongId(song.id);
          lastPreferredRef.current = preferredInstrument;
          return;
        }
      }

      const matchingRoleGroup = standardRoleGroups.find(
        (rg) => rg.role.toLowerCase() === preferredRole.toLowerCase()
      );

      if (matchingRoleGroup) {
        setActiveTrackId(matchingRoleGroup.id);
      } else if (standardRoleGroups.length > 0) {
        setActiveTrackId(standardRoleGroups[0].id);
      } else if (otherTracks.length > 0) {
        setActiveTrackId("other-tab");
        setSelectedOtherTrackId(otherTracks[0].id);
      }
      setInitializedSongId(song.id);
      setLazyLoadedTrackId(null);
      lastPreferredRef.current = preferredInstrument;
    } else if (activeTrackId === "other-tab" && !selectedOtherTrackId && otherTracks.length > 0) {
      setSelectedOtherTrackId(otherTracks[0].id);
    }
  }, [song, activeTrackId, selectedOtherTrackId, initializedSongId, preferredInstrument, activeRole]);

  // Lazy-load missing YT media for the active standard role group
  useEffect(() => {
    const standardRoleGroups = song.roleGroups.filter((rg) => rg.role !== "Other");
    const activeRoleGroup = standardRoleGroups.find((rg) => rg.id === activeTrackId);

    if (!activeRoleGroup) return;

    const needsBacking = activeRoleGroup.backingTrackLink === null;
    const needsTabVideo = activeRoleGroup.tabVideoLink === null;

    if (
      (needsBacking || needsTabVideo) &&
      activeRoleGroup.id !== lazyLoadedTrackId &&
      !isLazyLoading &&
      !loadingRef.current &&
      !attemptedLazy.has(activeRoleGroup.id)
    ) {
      loadingRef.current = true;
      setIsLazyLoading(true);
      attemptedLazy.add(activeRoleGroup.id);

      lazyLoadTrackMedia(activeRoleGroup.id)
        .then((res) => {
          loadingRef.current = false;
          if (!isMountedRef.current) return;
          setIsLazyLoading(false);
          setLazyLoadedTrackId(activeRoleGroup.id);
          if (res.success) onRefresh();
        })
        .catch((err) => {
          loadingRef.current = false;
          console.error("Lazy loading track media failed:", err);
          if (isMountedRef.current) {
            setIsLazyLoading(false);
            setLazyLoadedTrackId(activeRoleGroup.id);
          }
        });
    }
  }, [song.roleGroups, activeTrackId, lazyLoadedTrackId, isLazyLoading, onRefresh]);

  // Backfill missing metadata for legacy rows — once per song per session, so
  // revisits don't burn RATE_LIMITS.scrape when the scrape finds nothing.
  useEffect(() => {
    if (
      song &&
      !attemptedMetaBackfill.has(song.id) &&
      (!song.albumArt || !song.lyricsUrl)
    ) {
      attemptedMetaBackfill.add(song.id);
      refreshSongMetadata(song.id)
        .then((res) => {
          if (res.success && isMountedRef.current) onRefresh();
        })
        .catch((err) => console.error("Metadata refresh failed:", err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  if (!song.roleGroups || song.roleGroups.length === 0) {
    return (
      <div className="text-center py-10 bg-card border border-border rounded-2xl p-6 text-muted-foreground">
        <Music className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40 animate-pulse" />
        <h3 className="font-semibold text-lg text-foreground">No Tracks Found</h3>
        <p className="text-sm mt-1">
          This song doesn&apos;t have any notation or instrument tracks loaded.
        </p>
      </div>
    );
  }

  const standardRoleGroups = song.roleGroups.filter((rg) => rg.role !== "Other");
  const otherRoleGroup = song.roleGroups.find((rg) => rg.role === "Other");
  const otherTracks = otherRoleGroup?.tracks || [];

  function handleTabChange(val: string) {
    setActiveTrackId(val);
    const rg = song.roleGroups.find((g) => g.id === val);
    if (rg) {
      onRoleChange?.(rg.role);
    } else if (val === "other-tab") {
      onRoleChange?.("Other");
    }
  }

  return (
    <Card className="border-border bg-card overflow-hidden rounded-2xl shadow-xl">
      <CardHeader className="border-b border-border pb-5 pt-6 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {coverArtUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverArtUrl}
              alt=""
              className="w-14 h-14 rounded-xl object-cover border border-border flex-shrink-0"
            />
          )}
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/60 border border-dialog-border/50 px-2.5 py-1 rounded-full">
              Song Details
            </span>
            <CardTitle className="text-2xl font-heading font-bold text-foreground mt-2 flex items-center gap-2">
              {song.title}
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs mt-0.5 font-medium">
              by {song.artist}
            </CardDescription>
          </div>
        </div>
        {/* Stretches full-width on mobile (flex-col parent): practice left,
            trash pushed right, open space centered. Desktop: inline cluster. */}
        <div className="flex items-center gap-2">
          {onPractice && <PracticeButton onClick={onPractice} />}

          {onDelete && (
            <Button
              variant="danger-subtle"
              size="icon"
              onClick={onDelete}
              className="rounded-xl h-9 w-9 ml-auto"
              title={deleteTitle ?? "Delete Song"}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <Tabs value={activeTrackId} onValueChange={handleTabChange} className="w-full">
          <div className="overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none">
            <TabsList className="bg-background border border-border p-1 rounded-xl h-auto flex w-max min-w-full">
              {standardRoleGroups.map((rg) => (
                <TabsTrigger
                  key={rg.id}
                  value={rg.id}
                  className="px-4 py-2 text-xs font-bold rounded-xl data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground border border-transparent data-[state=active]:border-dialog-border hover:text-foreground transition-all cursor-pointer"
                >
                  {rg.role}
                </TabsTrigger>
              ))}

              {otherTracks.length > 0 && (
                <TabsTrigger
                  value="other-tab"
                  className="px-4 py-2 text-xs font-bold rounded-xl data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground border border-transparent data-[state=active]:border-dialog-border hover:text-foreground transition-all cursor-pointer"
                >
                  Other Instruments
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {standardRoleGroups.map((roleGroup) => {
            // Draft-aware view state: panels render exactly what Save will
            // persist, so staging a file/URL/removal updates previews live.
            const backingDraft = mediaDrafts[`${roleGroup.id}:backing`] ?? null;
            const tabDraft = mediaDrafts[`${roleGroup.id}:tab`] ?? null;

            const storedBackingUrl =
              roleGroup.backingTrackLink && roleGroup.backingTrackLink !== NO_VIDEO_SENTINEL
                ? roleGroup.backingTrackLink
                : null;
            const storedTabUrl =
              roleGroup.tabVideoLink && roleGroup.tabVideoLink !== NO_VIDEO_SENTINEL
                ? roleGroup.tabVideoLink
                : null;

            const effBackingUrl =
              backingDraft?.kind === "youtube" ? backingDraft.url.trim() || null : storedBackingUrl;
            const effTabUrl =
              tabDraft?.kind === "youtube" ? tabDraft.url.trim() || null : storedTabUrl;

            const persistedBackingCustom = roleGroup.backingCustomTrackId
              ? song.customTracks?.find((t) => t.id === roleGroup.backingCustomTrackId)
              : undefined;
            const persistedTabCustom = roleGroup.tabCustomTrackId
              ? song.customTracks?.find((t) => t.id === roleGroup.tabCustomTrackId)
              : undefined;

            const effBackingCustom = backingDraft?.kind === "custom"
              ? {
                  key: backingDraft.previewUrl,
                  src: backingDraft.previewUrl,
                  isVideo: backingDraft.file.type.startsWith("video/"),
                  label: backingDraft.file.name,
                }
              : !backingDraft && persistedBackingCustom
                ? {
                    key: persistedBackingCustom.id,
                    src: `/api/uploads/${persistedBackingCustom.id}`,
                    isVideo: persistedBackingCustom.isVideo,
                    label: persistedBackingCustom.label,
                  }
                : null;
            const effTabCustom = tabDraft?.kind === "custom"
              ? {
                  key: tabDraft.previewUrl,
                  src: tabDraft.previewUrl,
                  isVideo: tabDraft.file.type.startsWith("video/"),
                  label: tabDraft.file.name,
                }
              : !tabDraft && persistedTabCustom
                ? {
                    key: persistedTabCustom.id,
                    src: `/api/uploads/${persistedTabCustom.id}`,
                    isVideo: persistedTabCustom.isVideo,
                    label: persistedTabCustom.label,
                  }
                : null;

            const effBackingVideoId = effBackingUrl ? getYouTubeId(effBackingUrl) : null;
            const effTabVideoId = effTabUrl ? getYouTubeId(effTabUrl) : null;

            return (
              <TabsContent
                key={roleGroup.id}
                value={roleGroup.id}
                className="mt-6 space-y-6 focus-visible:ring-0 focus-visible:outline-none"
              >
                {/* Notation & Sheets */}
                <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                  <div>
                    <h4 className="font-heading font-bold text-sm text-muted-foreground flex items-center gap-1.5">
                      <Music className="w-4 h-4 text-muted-foreground" />{" "}
                      {roleGroup.role === "Vocals" ? "Lyrics" : "Notation & Sheets"}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                      {roleGroup.role === "Vocals"
                        ? "Select a vocalist track to open lyrics reference."
                        : "Select a track representation below to open notation."}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {roleGroup.tracks.map((track, idx) => {
                      const isMultiple = roleGroup.tracks.length > 1;
                      const isExpanded =
                        !isMultiple || (isNotationExpanded[track.id] ?? idx === 0);
                      const links = getAlternativeLinks(track.tabLink);

                      return (
                        <div
                          key={track.id}
                          className="bg-background/60 border border-border rounded-2xl overflow-hidden transition-all duration-200"
                        >
                          {isMultiple ? (
                            <button
                              type="button"
                              onClick={() =>
                                setIsNotationExpanded((prev) => ({
                                  ...prev,
                                  [track.id]: !isExpanded,
                                }))
                              }
                              className="w-full text-left p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-card/40 transition-colors cursor-pointer"
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-heading font-bold text-foreground">
                                  {track.instrumentName}{" "}
                                  {track.details ? `— ${track.details}` : ""}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  Track {idx + 1}
                                </span>
                              </div>

                              <div className="flex items-center gap-3.5">
                                {(roleGroup.role === "Guitar" || roleGroup.role === "Bass") && (
                                  <div className="flex items-center gap-1.5 bg-card border border-border px-2.5 py-1 rounded-lg">
                                    <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">
                                      Tuning:
                                    </span>
                                    <span className="text-xs font-mono font-bold text-muted-foreground tracking-wide">
                                      {track.tuning}
                                    </span>
                                  </div>
                                )}
                                <ChevronDown
                                  className={cn(
                                    "w-4 h-4 text-muted-foreground transition-transform duration-200",
                                    isExpanded && "rotate-180"
                                  )}
                                />
                              </div>
                            </button>
                          ) : (
                            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60">
                              <div>
                                <span className="text-xs font-heading font-bold text-foreground">
                                  {track.instrumentName}{" "}
                                  {track.details ? `— ${track.details}` : ""}
                                </span>
                              </div>
                              {(roleGroup.role === "Guitar" || roleGroup.role === "Bass") && (
                                <div className="flex items-center gap-1.5 bg-card border border-border px-2.5 py-1 rounded-lg">
                                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">
                                    Tuning:
                                  </span>
                                  <span className="text-xs font-mono font-bold text-muted-foreground tracking-wide">
                                    {track.tuning}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {isExpanded && (
                            <div className={cn("px-4 pb-4 space-y-3", !isMultiple && "pt-4")}>
                              {isMultiple && <div className="border-t border-border/60 my-2" />}
                              <div className="flex flex-wrap gap-2.5 pt-1">
                                {roleGroup.role === "Guitar" || roleGroup.role === "Bass" ? (
                                  <>
                                    <a
                                      href={links.tab}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <Music className="w-3.5 h-3.5 text-primary" />
                                      Interactive Tab
                                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                    </a>
                                    <a
                                      href={links.sheet}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-accent-soft hover:bg-accent-strong border border-ring/40 text-foreground rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <FileText className="w-3.5 h-3.5 text-role-keys" />
                                      Sheet Music
                                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                    </a>
                                    <a
                                      href={links.chords}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-success/10 hover:bg-success/20 border border-success/40 text-foreground rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <FileText className="w-3.5 h-3.5 text-role-bass" />
                                      Chords Sheet
                                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                    </a>
                                  </>
                                ) : roleGroup.role === "Piano/Keyboard" ? (
                                  <>
                                    <a
                                      href={links.sheet}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-accent-soft hover:bg-accent-strong border border-ring/40 text-foreground rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <FileText className="w-3.5 h-3.5 text-role-keys" />
                                      Sheet Music
                                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                    </a>
                                    <a
                                      href={links.chords}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-success/10 hover:bg-success/20 border border-success/40 text-foreground rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <FileText className="w-3.5 h-3.5 text-role-bass" />
                                      Chords Sheet
                                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                    </a>
                                  </>
                                ) : roleGroup.role === "Vocals" ? (
                                  <>
                                    <a
                                      href={
                                        song.lyricsUrl ||
                                        `https://genius.com/search?q=${encodeURIComponent(
                                          song.artist + " " + song.title
                                        )}`
                                      }
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-role-drums/10 hover:bg-role-drums/20 border-role-drums/40 text-foreground rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <FileText className="w-3.5 h-3.5 text-role-drums" />
                                      Open Lyrics
                                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                    </a>
                                    <a
                                      href={links.tab}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        buttonVariants({ variant: "default", size: "sm" }),
                                        "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                      )}
                                    >
                                      <Music className="w-3.5 h-3.5 text-primary" />
                                      Interactive Tab
                                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                    </a>
                                  </>
                                ) : (
                                  <a
                                    href={links.tab}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={cn(
                                      buttonVariants({ variant: "default", size: "sm" }),
                                      "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl flex items-center gap-1.5 text-xs font-bold py-2 px-3 transition-all"
                                    )}
                                  >
                                    <Music className="w-3.5 h-3.5 text-primary" />
                                    Interactive Tab
                                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Backing Track & Video Lessons */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Backing Track */}
                  <div className="flex flex-col bg-background border border-border rounded-2xl overflow-hidden shadow-lg">
                    <div className="p-4 border-b border-border flex items-center justify-between bg-card/20">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 text-muted-foreground" />{" "}
                        {roleGroup.role === "Vocals"
                          ? "Backing Track (Instrumental)"
                          : "Backing Track"}
                      </span>
                      <Button
                        size="sm"
                        onClick={() =>
                          setVideoSelectorState({
                            isOpen: true,
                            trackId: roleGroup.id,
                            type: "backing",
                            instrumentName: roleGroup.role,
                          })
                        }
                        className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl text-[10px] font-bold h-8"
                      >
                        Change
                      </Button>
                    </div>
                    <div className="flex-1 p-4 flex flex-col justify-center min-h-[220px]">
                      {effBackingCustom ? (
                        <CustomMediaPreview
                          key={effBackingCustom.key}
                          src={effBackingCustom.src}
                          isVideo={effBackingCustom.isVideo}
                          coverArtUrl={coverArtUrl}
                          label={effBackingCustom.label}
                        />
                      ) : isLazyLoading && roleGroup.backingTrackLink === null && !backingDraft ? (
                        <div className="flex flex-col items-center justify-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                          <p className="text-xs text-muted-foreground">
                            Searching YouTube backing track...
                          </p>
                        </div>
                      ) : effBackingVideoId ? (
                        <YouTubePreview videoId={effBackingVideoId} />
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-xs text-muted-foreground mb-4 font-medium">
                            No backing track link found.
                          </p>
                          <Button
                            onClick={() =>
                              setVideoSelectorState({
                                isOpen: true,
                                trackId: roleGroup.id,
                                type: "backing",
                                instrumentName: roleGroup.role,
                              })
                            }
                            className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground text-xs rounded-xl"
                          >
                            Search Backing Track
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tab/Reference Video */}
                  <div className="flex flex-col bg-background border border-border rounded-2xl overflow-hidden shadow-lg">
                    <div className="p-4 border-b border-border flex items-center justify-between bg-card/20">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5 text-muted-foreground" />{" "}
                        {roleGroup.role === "Vocals"
                          ? "Original Song (Vocal Reference)"
                          : roleGroup.role === "Piano/Keyboard"
                            ? "Video Lesson / Cover"
                            : "Tab Video Lesson"}
                      </span>
                      <Button
                        size="sm"
                        onClick={() =>
                          setVideoSelectorState({
                            isOpen: true,
                            trackId: roleGroup.id,
                            type: "tab",
                            instrumentName: roleGroup.role,
                          })
                        }
                        className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl text-[10px] font-bold h-8"
                      >
                        Change
                      </Button>
                    </div>
                    <div className="flex-1 p-4 flex flex-col justify-center min-h-[220px]">
                      {effTabCustom ? (
                        <CustomMediaPreview
                          key={effTabCustom.key}
                          src={effTabCustom.src}
                          isVideo={effTabCustom.isVideo}
                          coverArtUrl={coverArtUrl}
                          label={effTabCustom.label}
                        />
                      ) : isLazyLoading && roleGroup.tabVideoLink === null && !tabDraft ? (
                        <div className="flex flex-col items-center justify-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                          <p className="text-xs text-muted-foreground">
                            {roleGroup.role === "Vocals"
                              ? "Searching original song..."
                              : "Searching YouTube lesson..."}
                          </p>
                        </div>
                      ) : effTabVideoId ? (
                        <YouTubePreview videoId={effTabVideoId} />
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-xs text-muted-foreground mb-4 font-medium">
                            {roleGroup.role === "Vocals"
                              ? "No video reference found."
                              : "No video lesson or cover found."}
                          </p>
                          <Button
                            onClick={() =>
                              setVideoSelectorState({
                                isOpen: true,
                                trackId: roleGroup.id,
                                type: "tab",
                                instrumentName: roleGroup.role,
                              })
                            }
                            className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground text-xs rounded-xl"
                          >
                            {roleGroup.role === "Vocals"
                              ? "Search Original Song"
                              : roleGroup.role === "Piano/Keyboard"
                                ? "Search Video Lesson"
                                : "Search Tab Video"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <PracticeLogCard
                  songId={song.id}
                  initialStatus={initialProgress?.status}
                  initialNotes={initialProgress?.notes ?? ""}
                  initialSpeed={initialProgress?.speed}
                  onSaveSuccess={async () => {
                    await reloadProgress();
                    onRefresh();
                  }}
                  className="mt-6 border-border/60 bg-background/60"
                  showPrivateIndicator
                />
              </TabsContent>
            );
          })}

          {otherTracks.length > 0 && (
            <TabsContent value="other-tab" className="mt-6 focus-visible:ring-0 focus-visible:outline-none">
              {(() => {
                const currentOtherTrack =
                  otherTracks.find((t) => t.id === selectedOtherTrackId) || otherTracks[0];
                const links = getAlternativeLinks(currentOtherTrack.tabLink);

                return (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="md:col-span-1 space-y-2">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold block mb-1">
                        Select Instrument
                      </span>
                      <div className="flex md:flex-col overflow-x-auto gap-2 pb-2 md:pb-0 scrollbar-none">
                        {otherTracks.map((track) => {
                          const isSelected = track.id === currentOtherTrack.id;
                          return (
                            <Button
                              key={track.id}
                              variant={isSelected ? "default" : "outline"}
                              onClick={() => setSelectedOtherTrackId(track.id)}
                              className={cn(
                                "rounded-xl justify-start text-xs font-bold w-full h-10 px-3 transition-all shrink-0 cursor-pointer",
                                isSelected
                                  ? "bg-muted text-foreground border border-dialog-border"
                                  : "border-border bg-background/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                              )}
                            >
                              {track.instrumentName}
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:col-span-3 space-y-6">
                      <div className="bg-background border border-border rounded-2xl p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold block">
                            Equipment / Role Info
                          </span>
                          <span className="text-sm font-semibold text-foreground block mt-0.5 leading-relaxed whitespace-normal">
                            {currentOtherTrack.details || `Role: ${otherRoleGroup?.role ?? "Other"}`}
                          </span>
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-card border border-border flex items-center justify-center flex-shrink-0 ml-2">
                          <Info className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>

                      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                        <div>
                          <h4 className="font-heading font-bold text-sm text-muted-foreground flex items-center gap-1.5">
                            <Music className="w-4 h-4 text-muted-foreground" /> Notation &amp; Sheets
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1 font-medium">
                            Open the interactive sheet music or tab representation.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <a
                            href={links.tab}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              buttonVariants({ variant: "default", size: "default" }),
                              "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl shadow-md flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold transition-all cursor-pointer"
                            )}
                          >
                            <Music className="w-3.5 h-3.5 text-primary" />
                            Open Interactive Tab
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          </a>
                        </div>
                      </div>

                      <div className="bg-background border border-border rounded-2xl p-6 text-center text-muted-foreground">
                        <Info className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                        <h5 className="font-semibold text-sm text-foreground">Non-Standard Instrument</h5>
                        <p className="text-xs mt-1">
                          Backing tracks and video lessons are not automated for non-standard
                          instruments. Use the interactive notation tab above.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>
          )}
        </Tabs>
      </CardContent>

      {videoSelectorState &&
        (() => {
          const matchingGroup = song.roleGroups.find(
            (rg) => rg.id === videoSelectorState.trackId
          );
          const role = matchingGroup ? matchingGroup.role : "Other";
          const selectorCurrentUrl =
            videoSelectorState.type === "backing"
              ? matchingGroup?.backingTrackLink &&
                matchingGroup.backingTrackLink !== NO_VIDEO_SENTINEL
                ? matchingGroup.backingTrackLink
                : null
              : matchingGroup?.tabVideoLink &&
                  matchingGroup.tabVideoLink !== NO_VIDEO_SENTINEL
                ? matchingGroup.tabVideoLink
                : null;
          const selectorCurrentCustomTrackId =
            videoSelectorState.type === "backing"
              ? matchingGroup?.backingCustomTrackId ?? null
              : matchingGroup?.tabCustomTrackId ?? null;
          const selectorCurrentCustomTrack = selectorCurrentCustomTrackId
            ? song.customTracks?.find((t) => t.id === selectorCurrentCustomTrackId) ?? null
            : null;
          return (
            <VideoSelector
              isOpen={videoSelectorState.isOpen}
              onClose={() => setVideoSelectorState(null)}
              trackId={videoSelectorState.trackId}
              type={videoSelectorState.type}
              role={role}
              instrumentName={videoSelectorState.instrumentName}
              currentUrl={selectorCurrentUrl}
              currentCustomTrackId={selectorCurrentCustomTrackId}
              currentCustomTrack={selectorCurrentCustomTrack}
              songTitle={song.title}
              songArtist={song.artist}
              draft={
                mediaDrafts[
                  `${videoSelectorState.trackId}:${videoSelectorState.type}`
                ] ?? null
              }
              onDraftChange={(d) =>
                handleDraftChange(
                  videoSelectorState.trackId,
                  videoSelectorState.type,
                  selectorCurrentUrl,
                  selectorCurrentCustomTrackId,
                  d
                )
              }
            />
          );
        })()}
    </Card>
  );
}
