"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  addSongToRehearsalSetlist,
  removeSongFromRehearsalSetlist,
  reorderRehearsalSongs,
} from "@/app/actions/rehearsals";
import { ArrowUp, ArrowDown, Trash2, Plus, Music, ListMusic, Play } from "lucide-react";
import { SearchInput } from "./SearchInput";
import { PracticeButton } from "./PracticeButton";
import { ProgressBadge } from "./ProgressBadge";
import { TuningBadges } from "./TuningBadges";
import type { Song, RehearsalSong, ProgressMap } from "@/types/models";
import type { Role } from "@/lib/constants";

interface SetlistManagerProps {
  rehearsalId: string;
  rehearsalSongs: RehearsalSong[];
  allSongs: Song[];
  activeSongId: string | null;
  onSelectSong: (songId: string) => void;
  onRefresh: () => void;
  progressMap?: ProgressMap;
  onPracticeSong?: (songId: string) => void;
  onStartAutoplay?: () => void;
  preferredInstrument?: Role | string;
}

export function SetlistManager({
  rehearsalId,
  rehearsalSongs,
  allSongs,
  activeSongId,
  onSelectSong,
  onRefresh,
  progressMap,
  onPracticeSong,
  onStartAutoplay,
  preferredInstrument = "Guitar",
}: SetlistManagerProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const currentSongIds = new Set(rehearsalSongs.map((rs) => rs.songId));
  const availableSongs = allSongs.filter(
    (song) =>
      !currentSongIds.has(song.id) &&
      (song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        song.artist.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  async function handleAddSong(songId: string) {
    const res = await addSongToRehearsalSetlist(rehearsalId, songId);
    if (res.success) onRefresh();
  }

  async function handleRemoveSong(songId: string) {
    const res = await removeSongFromRehearsalSetlist(rehearsalId, songId);
    if (res.success) {
      if (activeSongId === songId) {
        const remaining = rehearsalSongs.filter((rs) => rs.songId !== songId);
        if (remaining.length > 0) onSelectSong(remaining[0].songId);
      }
      onRefresh();
    }
  }

  async function handleMove(index: number, direction: "up" | "down") {
    const newSongs = [...rehearsalSongs];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSongs.length) return;
    [newSongs[index], newSongs[targetIndex]] = [newSongs[targetIndex], newSongs[index]];
    const orderedIds = newSongs.map((rs) => rs.songId);
    const res = await reorderRehearsalSongs(rehearsalId, orderedIds);
    if (res.success) onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <ListMusic className="w-5 h-5 text-muted-foreground" />
          Setlist ({rehearsalSongs.length} songs)
        </h3>
        <div className="flex items-center gap-2">
          {rehearsalSongs.length > 0 && onStartAutoplay && (
            <PracticeButton onClick={onStartAutoplay} className="h-9 px-4" />
          )}
          <Button
            onClick={() => {
              setSearchQuery("");
              setIsAddOpen(true);
            }}
            className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl text-xs font-bold py-1 h-9"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Songs
          </Button>
        </div>
      </div>

      {rehearsalSongs.length === 0 ? (
        <div className="text-center py-10 bg-background/40 border border-border/80 rounded-2xl p-6 text-muted-foreground">
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
                    ? "bg-muted border-[#5b80a5]/40 shadow-md shadow-[#0c0d0e]/40"
                    : "bg-background/40 border-border/80 hover:bg-[#1c1d21]/60 hover:border-[#383a3f]"
                }`}
              >
                <button
                  onClick={() => onSelectSong(rs.songId)}
                  className="flex-1 text-left min-w-0 flex items-center gap-3 pr-2"
                >
                  <span className="text-xs font-mono font-bold text-muted-foreground w-5 text-right flex-shrink-0">
                    {index + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p
                        className={`text-sm font-bold truncate min-w-0 ${
                          isSelected ? "text-foreground" : "text-[#d1d1d6]"
                        }`}
                      >
                        {rs.song.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate font-medium w-full sm:hidden">
                        {rs.song.artist}
                      </p>
                      <ProgressBadge
                        status={progressMap?.[rs.songId]?.status || "not_started"}
                      />
                      <TuningBadges song={rs.song} highlightRole={preferredInstrument} size="xs" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5 font-medium hidden sm:block">
                      {rs.song.artist}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onPracticeSong?.(rs.songId)}
                    className="h-8 w-8 text-[#acd1f8] hover:text-[#cde3fa] hover:bg-[#2e4057]/40 rounded-lg mr-1 cursor-pointer"
                    title="Practice Mode"
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === 0}
                    onClick={() => handleMove(index, "up")}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg disabled:opacity-30"
                    title="Move Up"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === rehearsalSongs.length - 1}
                    onClick={() => handleMove(index, "down")}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg disabled:opacity-30"
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

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md w-[95vw] rounded-2xl max-h-[80vh] flex flex-col p-6 bg-card border border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Music className="w-5 h-5 text-muted-foreground" />
              Add Songs to Setlist
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Search and tap a song to add it to the rehearsal sequence.
            </DialogDescription>
          </DialogHeader>

          <SearchInput
            placeholder="Search by title or artist..."
            value={searchQuery}
            onChange={setSearchQuery}
            className="my-2"
          />

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 my-2 min-h-[250px] max-h-[40vh]">
            {availableSongs.length === 0 ? (
              <div className="text-center py-10 text-xs text-muted-foreground">
                {allSongs.length === 0
                  ? "Your library is empty. Add songs first!"
                  : "All library songs are already added."}
              </div>
            ) : (
              availableSongs.map((song) => (
                <div
                  key={song.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-background/40"
                >
                  <div className="min-w-0 pr-3 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="text-sm font-bold text-foreground truncate">{song.title}</p>
                      <TuningBadges song={song} highlightRole={preferredInstrument} size="xs" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{song.artist}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddSong(song.id)}
                    className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-lg px-3 py-1 h-8 font-bold text-xs"
                  >
                    Add
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-border">
            <Button
              onClick={() => setIsAddOpen(false)}
              className="w-full bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl font-semibold"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


