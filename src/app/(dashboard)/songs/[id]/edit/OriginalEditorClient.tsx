"use client";

import { useState, useTransition } from "react";
import { getSongDetails } from "@/app/actions/songs";
import { getCustomTracks } from "@/app/actions/customTracks";
import { getSongProgress } from "@/app/actions/user";
import { OriginalEditor } from "@/components/OriginalEditor";
import type { Song, CustomTrack } from "@/types/models";
import type { Role } from "@/lib/constants";

interface OriginalEditorClientProps {
  songId: string;
  initialSong: Song;
  initialTracks: CustomTrack[];
  preferredInstrument: Role;
  initialScratchpadNotes: string;
}

export function OriginalEditorClient({
  songId,
  initialSong,
  initialTracks,
  preferredInstrument,
  initialScratchpadNotes,
}: OriginalEditorClientProps) {
  const [song, setSong] = useState<Song>(initialSong);
  const [tracks, setTracks] = useState<CustomTrack[]>(initialTracks);
  const [scratchpadNotes, setScratchpadNotes] = useState<string>(initialScratchpadNotes);
  const [, startTransition] = useTransition();

  async function refresh() {
    startTransition(async () => {
      const [updatedSong, updatedTracks, updatedProgress] = await Promise.all([
        getSongDetails(songId),
        getCustomTracks(songId),
        getSongProgress(songId),
      ]);
      if (updatedSong) setSong(updatedSong);
      setTracks(updatedTracks);
      if (updatedProgress) setScratchpadNotes(updatedProgress.scratchpadNotes ?? "");
    });
  }

  return (
    <OriginalEditor
      song={song}
      tracks={tracks}
      preferredInstrument={preferredInstrument}
      initialScratchpadNotes={scratchpadNotes}
      onRefresh={refresh}
    />
  );
}