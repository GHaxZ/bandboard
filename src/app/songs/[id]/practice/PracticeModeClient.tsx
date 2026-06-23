"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PracticeMode } from "@/components/PracticeMode";
import { getSongDetails } from "@/app/actions/songs";
import { getUserSettings, getAllSongProgress } from "@/app/actions/user";
import { Song, ProgressMap } from "@/types/models";

interface PracticeModeClientProps {
  songId: string;
  initialSong: Song;
  preferredInstrument: string;
  initialProgressMap: ProgressMap;
}

export function PracticeModeClient({ songId, initialSong, preferredInstrument, initialProgressMap }: PracticeModeClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [song, setSong] = useState<Song>(initialSong);
  const [instrument, setInstrument] = useState(preferredInstrument);
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgressMap);

  useEffect(() => {
    // No longer need client-side data loader on mount as progressMap is loaded server-side!
  }, []);

  async function refreshData() {
    startTransition(async () => {
      const updated = await getSongDetails(songId);
      if (updated) {
        setSong(updated);
      }
      const progressList = await getAllSongProgress();
      const map: ProgressMap = {};
      progressList.forEach((p) => {
        map[p.songId] = {
          status: p.status,
          speed: p.speed,
          notes: p.notes,
          practiceMarkers: p.practiceMarkers,
          backingStartOffset: p.backingStartOffset,
          tabStartOffset: p.tabStartOffset,
        };
      });
      setProgressMap(map);
    });
  }

  return (
    <PracticeMode
      song={song}
      onExit={() => router.push(`/songs/${songId}`)}
      onRefresh={refreshData}
      progressMap={progressMap}
      preferredInstrument={instrument}
    />
  );
}
