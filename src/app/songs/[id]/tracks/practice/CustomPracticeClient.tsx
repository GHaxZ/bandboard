"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CustomPracticeMode } from "@/components/CustomPracticeMode";
import { getSongDetails } from "@/app/actions/songs";
import { getCustomTracks } from "@/app/actions/customTracks";
import { getProgressMap } from "@/app/actions/user";
import type { Song, CustomTrack, ProgressMap } from "@/types/models";
import type { Role } from "@/lib/constants";

interface CustomPracticeClientProps {
  songId: string;
  initialSong: Song;
  initialTracks: CustomTrack[];
  preferredInstrument: Role;
  initialProgressMap: ProgressMap;
  initialVolume: number;
  initialSpeed: number;
}

export function CustomPracticeClient({
  songId,
  initialSong,
  initialTracks,
  preferredInstrument,
  initialProgressMap,
  initialVolume,
  initialSpeed,
}: CustomPracticeClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [song, setSong] = useState<Song>(initialSong);
  const [tracks, setTracks] = useState<CustomTrack[]>(initialTracks);
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgressMap);

  async function refreshData() {
    startTransition(async () => {
      const updated = await getSongDetails(songId);
      if (updated) setSong(updated);
      const t = await getCustomTracks(songId);
      setTracks(t);
      const map = await getProgressMap();
      setProgressMap(map);
    });
  }

  return (
    <CustomPracticeMode
      song={song}
      tracks={tracks}
      onExit={() => router.push(`/songs/${songId}/tracks`)}
      onRefresh={refreshData}
      progressMap={progressMap}
      preferredInstrument={preferredInstrument}
      initialVolume={initialVolume}
      initialSpeed={initialSpeed}
    />
  );
}
