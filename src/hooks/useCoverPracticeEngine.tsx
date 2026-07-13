"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { useDualSyncedEngine } from "./useDualSyncedEngine";
import { useSlotMediaController } from "./useSlotMediaController";
import { useYoutubeApi } from "./useYoutubeApi";
import { useEnsureMedia } from "./useEnsureMedia";
import { getYouTubeId } from "@/lib/youtube";
import { resolveOffsets } from "@/types/models";
import { saveStartOffsets } from "@/app/actions/user";
import { toast } from "sonner";
import type { PlaybackEngine } from "@/lib/media-controller";
import type { Song, ProgressMap, Track, RoleGroup } from "@/types/models";
import type { Role } from "@/lib/constants";

export interface CoverState {
  activeTrackId: string;
  activeRoleGroup: RoleGroup | undefined;
  standardRoleGroups: RoleGroup[];
  otherTracks: Track[];
  onInstrumentChange: (role: string) => void;
  activeVideo: "backing" | "tab";
  hasBothVideos: boolean;
  isVocals: boolean;
  backingOffset: string;
  setBackingOffset: (v: string) => void;
  tabOffset: string;
  setTabOffset: (v: string) => void;
  isSavingOffsets: boolean;
  hasUnsavedOffsets: boolean;
  handleSaveOffsets: () => Promise<void>;
  getActiveCurrentTime: () => number;
  apiLoaded: boolean;
}

interface UseCoverPracticeEngineOpts {
  song: Song;
  progressMap: ProgressMap;
  preferredInstrument: Role;
  onRefresh: () => void;
}

interface UseCoverPracticeEngineResult {
  engine: PlaybackEngine;
  capabilities: { canToggle: true; hasOffsets: true };
  toggleVideo: () => void;
  coverState: CoverState;
  mediaSurface: React.ReactNode;
  hasCustomMedia: boolean;
  activeIsYouTube: boolean;
}

export function useCoverPracticeEngine({
  song,
  progressMap,
  preferredInstrument,
  onRefresh,
}: UseCoverPracticeEngineOpts): UseCoverPracticeEngineResult {
  const apiLoaded = useYoutubeApi();

  const standardRoleGroupsInitial = useMemo(
    () => song.roleGroups.filter((rg) => rg.role !== "Other"),
    [song.roleGroups]
  );
  const otherTracksInitial = useMemo(
    () => song.roleGroups.find((rg) => rg.role === "Other")?.tracks || [],
    [song.roleGroups]
  );

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

  const [backingOffset, setBackingOffset] = useState<string>("0");
  const [tabOffset, setTabOffset] = useState<string>("0");
  const [isSavingOffsets, setIsSavingOffsets] = useState(false);

  const activeVideo = usePlayerStore((s) => s.activeVideo);
  const setActiveVideo = usePlayerStore((s) => s.setActiveVideo);
  const reset = usePlayerStore((s) => s.reset);

  const standardRoleGroups = standardRoleGroupsInitial;
  const otherTracks = otherTracksInitial;

  const activeRoleGroup = standardRoleGroups.find((rg) => rg.id === activeTrackId);
  const backingVideoId = activeRoleGroup ? getYouTubeId(activeRoleGroup.backingTrackLink) : null;
  const tabVideoId = activeRoleGroup ? getYouTubeId(activeRoleGroup.tabVideoLink) : null;
  const backingCustomTrack = activeRoleGroup?.backingCustomTrackId
    ? song.customTracks?.find((t) => t.id === activeRoleGroup.backingCustomTrackId)
    : undefined;
  const tabCustomTrack = activeRoleGroup?.tabCustomTrackId
    ? song.customTracks?.find((t) => t.id === activeRoleGroup.tabCustomTrackId)
    : undefined;
  const backingCustomSrc = backingCustomTrack ? `/api/uploads/${backingCustomTrack.id}` : null;
  const tabCustomSrc = tabCustomTrack ? `/api/uploads/${tabCustomTrack.id}` : null;
  const backingReady = !!(backingVideoId || backingCustomSrc);
  const tabReady = !!(tabVideoId || tabCustomSrc);
  const hasBothVideos = !!(backingReady && tabReady);
  const activeIsYouTube =
    activeVideo === "backing"
      ? !!backingVideoId && !backingCustomSrc
      : !!tabVideoId && !tabCustomSrc;

  const prog = progressMap[song.id];
  const activeSavedOffsets = resolveOffsets(prog, activeTrackId);
  const backingOffsetVal = activeSavedOffsets.backing;
  const tabOffsetVal = activeSavedOffsets.tab;

  const currentBackingOffset = parseFloat(backingOffset) || 0;
  const currentTabOffset = parseFloat(tabOffset) || 0;
  const hasUnsavedOffsets =
    currentBackingOffset !== backingOffsetVal || currentTabOffset !== tabOffsetVal;

  const onEndedRef = useRef<() => void>(() => {});
  const stableOnEnded = useCallback(() => onEndedRef.current(), []);

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

  // Load offsets from progress
  useEffect(() => {
    const p = progressMap[song.id];
    const saved = resolveOffsets(p, activeTrackId);
    setBackingOffset(String(saved.backing));
    setTabOffset(String(saved.tab));
  }, [song.id, progressMap, activeTrackId]);

  // Lazy-load missing media
  useEnsureMedia({
    roleGroupId: activeRoleGroup?.id ?? null,
    role: activeRoleGroup?.role ?? "Other",
    backingTrackLink: activeRoleGroup?.backingTrackLink ?? null,
    tabVideoLink: activeRoleGroup?.tabVideoLink ?? null,
    onLoaded: onRefresh,
  });

  useEffect(() => {
    onEndedRef.current = () => {
      usePlayerStore.getState().setPlaying(false);
    };
  }, []);

  const backingController = useSlotMediaController({
    yawVideoId: backingVideoId,
    customSrc: backingCustomSrc,
    containerId: "backing-player-div",
    startOffset: backingOffsetVal,
    onEnded: stableOnEnded,
    isActive: () => usePlayerStore.getState().activeVideo === "backing",
  });
  const tabController = useSlotMediaController({
    yawVideoId: tabVideoId,
    customSrc: tabCustomSrc,
    containerId: "tab-player-div",
    startOffset: tabOffsetVal,
    onEnded: stableOnEnded,
    isActive: () => usePlayerStore.getState().activeVideo === "tab",
  });

  const players = useDualSyncedEngine({
    backing: backingController.controller,
    tab: tabController.controller,
    backingOffset: backingOffsetVal,
    tabOffset: tabOffsetVal,
  });

  // Reset store on unmount
  useEffect(() => {
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const engine: PlaybackEngine = useMemo(
    () => ({
      playPause: () => players.playPause(),
      seekBy: (delta: number) => players.seekBy(delta),
      seekTo: (time: number) => players.seekTo(time),
      getCurrentTime: () => players.getActiveCurrentTime(),
      get duration() {
        const ctrl =
          usePlayerStore.getState().activeVideo === "backing"
            ? backingController.controller
            : tabController.controller;
        return ctrl?.getDuration() ?? 0;
      },
      get isPlaying() {
        return usePlayerStore.getState().isPlaying;
      },
    }),
    // players and controllers are stable by design; the getters read fresh store state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players]
  );

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
  const hasCustomMedia = !!(backingReady || tabReady);

  const coverArtUrl = song.coverArtStoredName
    ? `/api/cover-art/${song.id}?v=${song.coverArtStoredName}`
    : song.albumArt || null;

  const coverState: CoverState = {
    activeTrackId,
    activeRoleGroup,
    standardRoleGroups,
    otherTracks,
    onInstrumentChange: handleInstrumentChange,
    activeVideo,
    hasBothVideos,
    isVocals,
    backingOffset,
    setBackingOffset,
    tabOffset,
    setTabOffset,
    isSavingOffsets,
    hasUnsavedOffsets,
    handleSaveOffsets,
    getActiveCurrentTime: () => players.getActiveCurrentTime(),
    apiLoaded,
  };

  return {
    engine,
    capabilities: { canToggle: true as const, hasOffsets: true as const },
    toggleVideo: players.toggleVideo,
    coverState,
    hasCustomMedia,
    activeIsYouTube,
    mediaSurface: (
      <>
        {backingReady && (
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
            {backingCustomSrc ? (
              backingCustomTrack?.isVideo ? (
                <video
                  ref={backingController.registerRef}
                  src={backingCustomSrc}
                  className="w-full h-full object-contain"
                />
              ) : (
                <>
                  <audio
                    // eslint-disable-next-line react-hooks/refs
                    ref={backingController.registerRef}
                    src={backingCustomSrc}
                    className="hidden"
                  />
                  {coverArtUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverArtUrl} alt="" className="w-full h-full object-contain" />
                  ) : null}
                </>
              )
            ) : (
              <div id="backing-player-div" className="w-full h-full" />
            )}
          </div>
        )}

        {tabReady && (
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
            {tabCustomSrc ? (
              tabCustomTrack?.isVideo ? (
                <video
                  ref={tabController.registerRef}
                  src={tabCustomSrc}
                  className="w-full h-full object-contain"
                />
              ) : (
                <>
                  <audio
                    // eslint-disable-next-line react-hooks/refs
                    ref={tabController.registerRef}
                    src={tabCustomSrc}
                    className="hidden"
                  />
                  {coverArtUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverArtUrl} alt="" className="w-full h-full object-contain" />
                  ) : null}
                </>
              )
            ) : (
              <div id="tab-player-div" className="w-full h-full" />
            )}
          </div>
        )}

        {((activeVideo === "backing" && !backingReady) || (activeVideo === "tab" && !tabReady)) && (
          <div className="absolute inset-0 flex items-center justify-center">
            {(() => {
              const artUrl = song.coverArtStoredName
                ? `/api/cover-art/${song.id}?v=${song.coverArtStoredName}`
                : song.albumArt || null;
              if (artUrl) {
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={artUrl} alt="" className="w-full h-full object-contain" />
                );
              }
              return (
                <div className="text-center p-6 text-muted-foreground">
                  <p className="text-sm font-semibold text-foreground">
                    No {activeVideo === "backing" ? "backing track" : "tab/lesson video"} configured for this instrument.
                  </p>
                </div>
              );
            })()}
          </div>
        )}

        {!apiLoaded && (
          <div className="absolute inset-0 bg-background/95 flex flex-col items-center justify-center">
            <SpinnerIcon className="w-8 h-8 animate-spin text-[#5b80a5] mb-2" />
            <p className="text-xs text-muted-foreground">Loading YouTube Player API...</p>
          </div>
        )}

        {(backingReady || tabReady) && (
          <div
            className="absolute left-[44px] bottom-0 w-[48px] h-[36px] z-10 bg-transparent cursor-default"
            title="Volume controlled via settings below"
          />
        )}
      </>
    ),
  };
}

// Inline icon components so the hook file has no external UI deps beyond what it re-exports.
function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
