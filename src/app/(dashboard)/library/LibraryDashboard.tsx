"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Music as MusicIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddSongModal } from "@/components/AddSongModal";
import { SearchInput } from "@/components/SearchInput";
import { EmptyState } from "@/components/EmptyState";
import { SongCard } from "@/components/SongCard";
import { getSongs } from "@/app/actions/songs";
import { getProgressMap } from "@/app/actions/user";
import type { Song, ProgressMap } from "@/types/models";
import type { Role } from "@/lib/constants";

interface LibraryDashboardProps {
  initialSongs: Song[];
  preferredInstrument: Role;
  initialProgressMap: ProgressMap;
}

export function LibraryDashboard({
  initialSongs,
  preferredInstrument,
  initialProgressMap,
}: LibraryDashboardProps) {
  const router = useRouter();
  const [songsList, setSongsList] = useState<Song[]>(initialSongs);
  const [songSearchQuery, setSongSearchQuery] = useState("");
  const [isAddSongOpen, setIsAddSongOpen] = useState(false);
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgressMap);
  const [, startTransition] = useTransition();

  async function refreshData() {
    startTransition(async () => {
      const updatedSongs = await getSongs();
      setSongsList(updatedSongs);
      const map = await getProgressMap();
      setProgressMap(map);
    });
  }

  const filteredSongs = songsList.filter(
    (s) =>
      s.title.toLowerCase().includes(songSearchQuery.toLowerCase()) ||
      s.artist.toLowerCase().includes(songSearchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-foreground flex items-center gap-2">
            <MusicIcon className="w-5 h-5 text-muted-foreground" />
            Song Library
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Master repository of notations, tracks, and metadata.
          </p>
        </div>
        <Button
          onClick={() => setIsAddSongOpen(true)}
          className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl shadow-md font-bold text-xs"
        >
          <Plus className="w-4 h-4 mr-1" /> Add New Song
        </Button>
      </div>

      <SearchInput
        placeholder="Search library by title or artist..."
        value={songSearchQuery}
        onChange={setSongSearchQuery}
      />

      {filteredSongs.length === 0 ? (
        <EmptyState
          icon={MusicIcon}
          title="No Songs Found"
          description="Add a new song to download notation tabs, backing tracks and scores."
          action={
            <Button
              onClick={() => setIsAddSongOpen(true)}
              className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl text-xs font-bold"
            >
              Add Your First Song
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSongs.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              progressMap={progressMap}
              preferredInstrument={preferredInstrument}
              onPractice={(id) => router.push(`/songs/${id}/practice`)}
            />
          ))}
        </div>
      )}

      <AddSongModal
        isOpen={isAddSongOpen}
        onClose={() => setIsAddSongOpen(false)}
        onSuccess={refreshData}
      />
    </div>
  );
}
