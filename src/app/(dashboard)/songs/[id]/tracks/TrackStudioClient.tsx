"use client";

import { useState, useTransition } from "react";
import { getCustomTracks } from "@/app/actions/customTracks";
import { TrackStudio } from "@/components/TrackStudio";
import type { Song, CustomTrack } from "@/types/models";
import type { Role } from "@/lib/constants";

interface TrackStudioClientProps {
  songId: string;
  initialSong: Song;
  initialTracks: CustomTrack[];
  preferredInstrument: Role;
}

export function TrackStudioClient({
  songId,
  initialSong,
  initialTracks,
  preferredInstrument,
}: TrackStudioClientProps) {
  const [tracks, setTracks] = useState<CustomTrack[]>(initialTracks);
  const [, startTransition] = useTransition();

  async function refresh() {
    startTransition(async () => {
      const updated = await getCustomTracks(songId);
      setTracks(updated);
    });
  }

  return (
    <TrackStudio
      song={initialSong}
      tracks={tracks}
      preferredInstrument={preferredInstrument}
      onRefresh={refresh}
    />
  );
}
