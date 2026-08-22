"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PracticeShell } from "@/components/PracticeShell";
import { useCoverPracticeEngine } from "@/hooks/useCoverPracticeEngine";
import { useMultiStemPracticeEngine } from "@/hooks/useMultiStemPracticeEngine";
import { getSongDetails } from "@/app/actions/songs";
import { getCustomTracks } from "@/app/actions/customTracks";
import { getProgressMap } from "@/app/actions/user";
import { getCoverArtUrl } from "@/components/CoverArt";
import type { Song, ProgressMap, CustomTrack } from "@/types/models";
import type { Role } from "@/lib/constants";

interface PracticeModeClientProps {
  songId: string;
  initialSong: Song;
  initialTracks: CustomTrack[];
  preferredInstrument: Role;
  initialProgressMap: ProgressMap;
  initialVolume: number;
  initialSpeed: number;
}

export function PracticeModeClient({
  songId,
  initialSong,
  initialTracks,
  preferredInstrument,
  initialProgressMap,
  initialVolume,
  initialSpeed,
}: PracticeModeClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [song, setSong] = useState<Song>(initialSong);
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgressMap);
  const [tracks, setTracks] = useState<CustomTrack[]>(initialTracks);

  async function refreshData() {
    startTransition(async () => {
      const [updated, map, t] = await Promise.all([
        getSongDetails(songId),
        getProgressMap(),
        getCustomTracks(songId),
      ]);
      if (updated) setSong(updated);
      setProgressMap(map);
      setTracks(t);
    });
  }

  const onExit = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(`/songs/${songId}`);
  };

  if (song.songType === "original") {
    return (
      <OriginalPractice
        song={song}
        tracks={tracks}
        progressMap={progressMap}
        preferredInstrument={preferredInstrument}
        initialVolume={initialVolume}
        initialSpeed={initialSpeed}
        onExit={onExit}
        onRefresh={refreshData}
      />
    );
  }

  return (
    <CoverPractice
      song={song}
      progressMap={progressMap}
      preferredInstrument={preferredInstrument}
      initialVolume={initialVolume}
      initialSpeed={initialSpeed}
      onExit={onExit}
      onRefresh={refreshData}
    />
  );
}

interface CoverPracticeProps {
  song: Song;
  progressMap: ProgressMap;
  preferredInstrument: Role;
  initialVolume: number;
  initialSpeed: number;
  onExit: () => void;
  onRefresh: () => void;
}

function CoverPractice({
  song,
  progressMap,
  preferredInstrument,
  initialVolume,
  initialSpeed,
  onExit,
  onRefresh,
}: CoverPracticeProps) {
  const { engine, capabilities, toggleVideo, coverState, mediaSurface, hasMedia, activeIsYouTube } = useCoverPracticeEngine({
    song,
    progressMap,
    preferredInstrument,
    onRefresh,
  });

  return (
    <PracticeShell
      song={song}
      progressMap={progressMap}
      onExit={onExit}
      onRefresh={onRefresh}
      engine={engine}
      capabilities={capabilities}
      initialVolume={initialVolume}
      initialSpeed={initialSpeed}
      mediaSurface={mediaSurface}
      onToggleVideo={toggleVideo}
      coverState={coverState}
      hasMedia={hasMedia}
      youTubeMode={activeIsYouTube}
    />
  );
}

interface OriginalPracticeProps {
  song: Song;
  tracks: CustomTrack[];
  progressMap: ProgressMap;
  preferredInstrument: Role;
  initialVolume: number;
  initialSpeed: number;
  onExit: () => void;
  onRefresh: () => void;
}

function OriginalPractice({
  song,
  tracks,
  progressMap,
  preferredInstrument,
  initialVolume,
  initialSpeed,
  onExit,
  onRefresh,
}: OriginalPracticeProps) {
  const coverArtUrl = getCoverArtUrl(song);

  const {
    engine,
    capabilities,
    activeRole,
    setActiveRole,
    availableRoles,
    stemTracks,
    registerRef,
    mutedTrackIds,
    mediaSurface,
    hasMedia,
  } = useMultiStemPracticeEngine({ tracks, preferredInstrument, coverArtUrl });

  return (
    <PracticeShell
      song={song}
      progressMap={progressMap}
      onExit={onExit}
      onRefresh={onRefresh}
      engine={engine}
      capabilities={capabilities}
      initialVolume={initialVolume}
      initialSpeed={initialSpeed}
      mediaSurface={mediaSurface}
      activeRole={activeRole}
      onActiveRoleChange={setActiveRole}
      availableRoles={availableRoles}
      stemTracks={stemTracks}
      registerRef={registerRef}
      mutedTrackIds={mutedTrackIds}
      hasMedia={hasMedia}
    />
  );
}