"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PracticeMode } from "@/components/PracticeMode";
import { getSongDetails } from "@/app/actions/songs";
import { getProgressMap } from "@/app/actions/user";
import type { Song, ProgressMap } from "@/types/models";
import type { Role } from "@/lib/constants";

interface PracticeModeClientProps {
  songId: string;
  initialSong: Song;
  preferredInstrument: Role;
  initialProgressMap: ProgressMap;
  initialVolume: number;
  initialSpeed: number;
}

export function PracticeModeClient({
  songId,
  initialSong,
  preferredInstrument,
  initialProgressMap,
  initialVolume,
  initialSpeed,
}: PracticeModeClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [song, setSong] = useState<Song>(initialSong);
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgressMap);

  async function refreshData() {
    startTransition(async () => {
      const updated = await getSongDetails(songId);
      if (updated) setSong(updated);
      const map = await getProgressMap();
      setProgressMap(map);
    });
  }

  return (
    <PracticeMode
      song={song}
      onExit={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(`/songs/${songId}`);
      }}
      onRefresh={refreshData}
      progressMap={progressMap}
      preferredInstrument={preferredInstrument}
      initialVolume={initialVolume}
      initialSpeed={initialSpeed}
    />
  );
}
