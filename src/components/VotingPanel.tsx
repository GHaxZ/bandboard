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
import { ChevronUp, Trash2, Plus, ListMusic } from "lucide-react";
import { SearchInput } from "./SearchInput";
import { ProgressBadge } from "./ProgressBadge";
import { SongTypeBadge } from "./SongTypeBadge";
import { TuningBadges } from "./TuningBadges";
import { CoverArt } from "./CoverArt";
import { SongCommentPopover } from "./SongCommentPopover";
import type { Song, ProgressMap, VotingCandidate } from "@/types/models";
import type { Role } from "@/lib/constants";

interface VotingPanelProps {
  rehearsalId: string;
  candidates: VotingCandidate[];
  allSongs: Song[];
  activeSongId: string | null;
  votingOpen: boolean;
  songSelectionCount: number;
  currentUserId: string;
  currentUsername: string;
  preferredInstrument: Role;
  progressMap: ProgressMap;
  onSelectSong: (songId: string) => void;
  onToggleVote: (songId: string) => void;
  onNominate: (songId: string) => Promise<void>;
  /** Client shows a confirm dialog (removal destroys votes + comments). */
  onRequestRemoveNomination: (songId: string) => void;
  onCommentCountChange: (songId: string, delta: number) => void;
  onCommentsRead: (songId: string) => void;
}

/** Ranked candidate list for an open song vote (left column). */
export function VotingPanel({
  rehearsalId,
  candidates,
  allSongs,
  activeSongId,
  votingOpen,
  songSelectionCount,
  currentUserId,
  currentUsername,
  preferredInstrument,
  progressMap,
  onSelectSong,
  onToggleVote,
  onNominate,
  onRequestRemoveNomination,
  onCommentCountChange,
  onCommentsRead,
}: VotingPanelProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());

  const nominatedIds = new Set(candidates.map((c) => c.song.id));
  const availableSongs = allSongs.filter(
    (song) =>
      !nominatedIds.has(song.id) &&
      (song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        song.artist.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Ranking is derived: votes desc, earliest nomination asc.
  const ranked = [...candidates].sort(
    (a, b) => b.voteCount - a.voteCount || a.addedAt - b.addedAt
  );

  function withPending(songId: string, fn: () => Promise<void>) {
    return async () => {
      if (pendingActionIds.has(songId)) return;
      setPendingActionIds((prev) => new Set(prev).add(songId));
      try {
        await fn();
      } finally {
        setPendingActionIds((prev) => {
          const next = new Set(prev);
          next.delete(songId);
          return next;
        });
      }
    };
  }

  async function handleNominate(songId: string) {
    await withPending(songId, () => onNominate(songId))();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <ListMusic className="w-5 h-5 text-muted-foreground" />
          Candidates ({candidates.length})
        </h3>
        {votingOpen && (
          <Button
            onClick={() => {
              setSearchQuery("");
              setIsAddOpen(true);
            }}
            className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl text-xs font-bold py-1 h-9"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground font-medium -mt-2">
        Top {songSelectionCount} songs will form the rehearsal setlist · ties at the cut-off all
        advance.
      </p>

      {ranked.length === 0 ? (
        <div className="text-center py-10 bg-background/40 border border-border/80 rounded-2xl p-6 text-muted-foreground">
          <ListMusic className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-xs">No songs nominated yet.</p>
          {votingOpen && (
            <Button
              onClick={() => setIsAddOpen(true)}
              variant="link"
              className="text-primary hover:text-accent-text-strong text-xs font-bold mt-1"
            >
              Nominate the first song
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {ranked.map((candidate, index) => {
            const song = candidate.song;
            const isSelected = activeSongId === song.id;
            const inSelection = index < songSelectionCount;
            return (
              <div
                key={song.id}
                className={`p-3 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? "bg-muted border-ring/40 shadow-md shadow-black/20"
                    : "bg-background/40 border-border/80 hover:bg-card/60 hover:border-ring/30"
                }`}
              >
                {/* Mobile (<420px): title on top, vote+comment bottom-left,
                    trash pushed right. Desktop: classic single row. */}
                <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center gap-2 min-[420px]:gap-0">
                  <button
                    onClick={() => onSelectSong(song.id)}
                    className="flex-1 min-w-0 text-left flex items-center gap-3 min-[520px]:pr-2 cursor-pointer"
                  >
                    <span
                      className={`text-xs font-mono font-bold w-6 text-right flex-shrink-0 ${
                        inSelection
                          ? "text-violet-600 dark:text-violet-400"
                          : "text-muted-foreground"
                      }`}
                      title={
                        inSelection
                          ? "Currently in the selection"
                          : "Currently below the cut-off"
                      }
                    >
                      {index + 1}.
                    </span>
                    <CoverArt song={song} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground/90 truncate min-w-0">
                        {song.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5 font-medium">
                        {song.artist}
                        {candidate.addedByUsername && (
                          <span className="text-muted-foreground/70">
                            {" "}
                            · via {candidate.addedByUsername}
                          </span>
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                        <SongTypeBadge songType={song.songType} />
                        <ProgressBadge status={progressMap[song.id]?.status || "not_started"} />
                        <TuningBadges song={song} highlightRole={preferredInstrument} size="xs" />
                      </div>
                    </div>
                  </button>

                  {/* Mobile (<420px): vote+comment bottom-left, trash pushed
                      right. Desktop: inline cluster. */}
                  <div className="flex items-center gap-1 shrink-0 self-start min-[420px]:self-auto w-full min-[420px]:w-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!votingOpen || pendingActionIds.has(song.id)}
                      onClick={() => onToggleVote(song.id)}
                      title={candidate.votedByMe ? "Remove your vote" : "Vote for this song"}
                      className={`h-8 px-2.5 gap-0.5 rounded-lg font-bold text-xs cursor-pointer border transition-all duration-200 ${
                        candidate.votedByMe
                          ? "bg-primary text-primary-foreground border-primary/60 shadow-sm hover:bg-primary/90"
                          : "bg-primary/15 border-primary/25 text-primary/70 hover:bg-primary/25 hover:text-primary hover:border-primary/40"
                      }`}
                    >
                      <ChevronUp className="w-4 h-4" />
                      <span className="tabular-nums">{candidate.voteCount}</span>
                    </Button>

                    <SongCommentPopover
                      rehearsalId={rehearsalId}
                      songId={song.id}
                      songTitle={song.title}
                      commentCount={candidate.commentCount}
                      hasUnread={candidate.hasUnreadComments}
                      disabled={!votingOpen}
                      currentUserId={currentUserId}
                      currentUsername={currentUsername}
                      onCountChange={onCommentCountChange}
                      onMarkedRead={onCommentsRead}
                    />

                    {votingOpen && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRequestRemoveNomination(song.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg ml-auto min-[420px]:ml-0.5 disabled:opacity-40"
                        title="Remove nomination (and its votes/comments)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md w-[95vw] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <ListMusic className="w-5 h-5 text-muted-foreground" />
              Nominate Songs
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs">
              Search and tap a song to add it to the vote. Every member can then vote on it.
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
                  : "All library songs are already nominated."}
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
                    disabled={pendingActionIds.has(song.id)}
                    onClick={() => handleNominate(song.id)}
                    className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-lg px-3 py-1 h-8 font-bold text-xs disabled:opacity-40"
                  >
                    {pendingActionIds.has(song.id) ? "Adding..." : "Add"}
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
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
