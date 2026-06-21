"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addSongToRehearsalSetlist, removeSongFromRehearsalSetlist, reorderRehearsalSongs } from "@/app/actions/rehearsals";
import { ArrowUp, ArrowDown, Trash2, Plus, Music, Search, ListMusic } from "lucide-react";

interface Track {
  id: string;
  roleGroupId: string;
  instrumentName: string;
  role: string;
  details: string | null;
  tuning: string;
  tabLink: string;
}

interface RoleGroup {
  id: string;
  songId: string;
  role: string;
  backingTrackLink: string | null;
  tabVideoLink: string | null;
  tracks: Track[];
}

interface Song {
  id: string;
  title: string;
  artist: string;
  songsterrId: number | null;
  createdAt: number;
  roleGroups: RoleGroup[];
}

interface RehearsalSong {
  rehearsalId: string;
  songId: string;
  sortOrder: number;
  song: Song;
}

interface SetlistManagerProps {
  rehearsalId: string;
  rehearsalSongs: RehearsalSong[];
  allSongs: Song[];
  activeSongId: string | null;
  onSelectSong: (songId: string) => void;
  onRefresh: () => void;
}

export function SetlistManager({
  rehearsalId,
  rehearsalSongs,
  allSongs,
  activeSongId,
  onSelectSong,
  onRefresh,
}: SetlistManagerProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const currentSongIds = new Set(rehearsalSongs.map((rs) => rs.songId));
  
  // Filter songs that are not yet in the rehearsal
  const availableSongs = allSongs.filter(
    (song) =>
      !currentSongIds.has(song.id) &&
      (song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        song.artist.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  async function handleAddSong(songId: string) {
    const res = await addSongToRehearsalSetlist(rehearsalId, songId);
    if (res.success) {
      onRefresh();
    }
  }

  async function handleRemoveSong(songId: string) {
    const res = await removeSongFromRehearsalSetlist(rehearsalId, songId);
    if (res.success) {
      if (activeSongId === songId) {
        // Clear selected song if it was deleted
        const remaining = rehearsalSongs.filter((rs) => rs.songId !== songId);
        if (remaining.length > 0) {
          onSelectSong(remaining[0].songId);
        }
      }
      onRefresh();
    }
  }

  async function handleMove(index: number, direction: "up" | "down") {
    const newSongs = [...rehearsalSongs];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSongs.length) return;

    // Swap items
    const temp = newSongs[index];
    newSongs[index] = newSongs[targetIndex];
    newSongs[targetIndex] = temp;

    const orderedIds = newSongs.map((rs) => rs.songId);
    const res = await reorderRehearsalSongs(rehearsalId, orderedIds);
    if (res.success) {
      onRefresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#f1f2f4] flex items-center gap-2">
          <ListMusic className="w-5 h-5 text-[#888d96]" />
          Setlist ({rehearsalSongs.length} songs)
        </h3>
        <Button
          onClick={() => {
            setSearchQuery("");
            setIsAddOpen(true);
          }}
          className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl text-xs font-bold py-1 h-9"
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Songs
        </Button>
      </div>

      {rehearsalSongs.length === 0 ? (
        <div className="text-center py-10 bg-[#0c0d0e]/40 border border-[#27282b]/80 rounded-2xl p-6 text-[#888d96]">
          <Music className="w-8 h-8 mx-auto mb-2 text-[#27282b]" />
          <p className="text-xs">Your setlist is empty.</p>
          <Button
            onClick={() => setIsAddOpen(true)}
            variant="link"
            className="text-[#5b80a5] hover:text-[#7ba0c5] text-xs font-bold mt-1"
          >
            Add your first song
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {rehearsalSongs.map((rs, index) => {
            const isSelected = activeSongId === rs.songId;
            return (
              <div
                key={rs.songId}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? "bg-[#27282b] border-[#5b80a5]/40 shadow-md shadow-[#0c0d0e]/40"
                    : "bg-[#0c0d0e]/40 border-[#27282b]/80 hover:bg-[#1c1d21]/60 hover:border-[#383a3f]"
                }`}
              >
                {/* Song info and selection clicker */}
                <button
                  onClick={() => onSelectSong(rs.songId)}
                  className="flex-1 text-left min-w-0 flex items-center gap-3 pr-2"
                >
                  <span className="text-xs font-mono font-bold text-[#888d96] w-5 text-right flex-shrink-0">
                    {index + 1}.
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-bold truncate ${isSelected ? "text-[#f1f2f4]" : "text-[#d1d1d6]"}`}>
                      {rs.song.title}
                    </p>
                    <p className="text-xs text-[#888d96] truncate mt-0.5 font-medium">
                      {rs.song.artist}
                    </p>
                  </div>
                </button>

                {/* Reordering and removal controls */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    onClick={() => handleMove(index, "up")}
                    className="h-8 w-8 text-[#888d96] hover:text-[#f1f2f4] hover:bg-[#27282b] rounded-lg disabled:opacity-30"
                    title="Move Up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === rehearsalSongs.length - 1}
                    onClick={() => handleMove(index, "down")}
                    className="h-8 w-8 text-[#888d96] hover:text-[#f1f2f4] hover:bg-[#27282b] rounded-lg disabled:opacity-30"
                    title="Move Down"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveSong(rs.songId)}
                    className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-950/20 rounded-lg ml-1"
                    title="Remove from Setlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Songs Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md w-[95vw] rounded-2xl max-h-[80vh] flex flex-col p-6 bg-[#161719] border border-[#27282b] text-[#f1f2f4]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-[#f1f2f4]">
              <Music className="w-5 h-5 text-[#888d96]" />
              Add Songs to Setlist
            </DialogTitle>
            <DialogDescription className="text-[#888d96] text-xs">
              Search and tap a song to add it to the rehearsal sequence.
            </DialogDescription>
          </DialogHeader>

          {/* Search bar */}
          <div className="relative my-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888d96]" />
            <Input
              placeholder="Search by title or artist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#0c0d0e] border-[#27282b] text-[#f1f2f4] pl-10 focus-visible:ring-[#5b80a5] focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
            />
          </div>

          {/* Scrollable song list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 my-2 min-h-[250px] max-h-[40vh]">
            {availableSongs.length === 0 ? (
              <div className="text-center py-10 text-xs text-[#888d96]">
                {allSongs.length === 0
                  ? "Your library is empty. Add songs first!"
                  : "All library songs are already added."}
              </div>
            ) : (
              availableSongs.map((song) => (
                <div
                  key={song.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-[#27282b]/60 bg-[#0c0d0e]/40"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-sm font-bold text-[#f1f2f4] truncate">{song.title}</p>
                    <p className="text-xs text-[#888d96] truncate mt-0.5">{song.artist}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddSong(song.id)}
                    className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-lg px-3 py-1 h-8 font-bold text-xs"
                  >
                    Add
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-[#27282b]">
            <Button
              onClick={() => setIsAddOpen(false)}
              className="w-full bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl font-semibold"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
