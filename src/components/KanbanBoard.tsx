"use client";

import { useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { ChevronLeft, ChevronRight, Music, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getSongTunings } from "@/lib/tunings";
import { SearchInput } from "./SearchInput";
import { PROGRESS_STATUSES } from "@/lib/constants";
import type { RehearsalSong, ProgressMap } from "@/types/models";
import type { Role } from "@/lib/constants";

interface KanbanBoardProps {
  rehearsalId: string;
  rehearsalSongs: RehearsalSong[];
  progressMap: ProgressMap;
  onSaveProgress: (songId: string, status: string) => Promise<void>;
  onSelectSong?: (songId: string) => void;
  onPracticeSong?: (songId: string) => void;
  preferredInstrument?: Role | string;
}

export function KanbanBoard({
  rehearsalId,
  rehearsalSongs,
  progressMap,
  onSaveProgress,
  onSelectSong,
  onPracticeSong,
  preferredInstrument = "Guitar",
}: KanbanBoardProps) {
  const [searchQuery, setSearchQuery] = useState("");

  void rehearsalId; // available for future use

  const filteredSongs = rehearsalSongs.filter(
    (rs) =>
      rs.song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rs.song.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSongsByStatus = (statusId: string) =>
    filteredSongs.filter((rs) => {
      const currentStatus = progressMap[rs.songId]?.status || "not_started";
      return currentStatus === statusId;
    });

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return;
    void onSaveProgress(draggableId, destination.droppableId);
  }

  const getMoveOptions = (currentStatus: string) => {
    const currentIndex = PROGRESS_STATUSES.findIndex((s) => s.id === currentStatus);
    const leftStatus = currentIndex > 0 ? PROGRESS_STATUSES[currentIndex - 1].id : null;
    const rightStatus =
      currentIndex < PROGRESS_STATUSES.length - 1 ? PROGRESS_STATUSES[currentIndex + 1].id : null;
    return { leftStatus, rightStatus };
  };

  const getLabel = (statusId: string) =>
    PROGRESS_STATUSES.find((s) => s.id === statusId)?.label || statusId;

  return (
    <div className="space-y-4 flex flex-col h-full">
      <SearchInput placeholder="Search setlist songs..." value={searchQuery} onChange={setSearchQuery} />

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x scroll-smooth w-full flex-grow">
          {PROGRESS_STATUSES.map((column) => {
            const columnSongs = getSongsByStatus(column.id);
            return (
              <div
                key={column.id}
                className="bg-card/40 border border-border rounded-2xl p-4 flex flex-col min-w-[320px] snap-start flex-1 shadow-md h-[calc(100dvh-280px)] min-h-[480px]"
              >
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-border/60 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", column.dot)} />
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                      {column.label}
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground bg-background border border-border px-2 py-0.5 rounded-md">
                    {columnSongs.length}
                  </span>
                </div>

                <Droppable droppableId={column.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn(
                        "flex flex-col gap-3 flex-1 overflow-y-auto pr-1.5 transition-all duration-200 rounded-xl",
                        snapshot.isDraggingOver ? "bg-muted/15" : ""
                      )}
                    >
                      {columnSongs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border rounded-xl text-center p-4 min-h-[150px] flex-grow">
                          <Music className="w-6 h-6 text-[#27282b] mb-1.5" />
                          <p className="text-[10px] text-[#4e525a] font-medium leading-normal">
                            No songs here
                          </p>
                        </div>
                      ) : (
                        columnSongs.map((rs, index) => {
                          const song = rs.song;
                          const currentStatus = progressMap[rs.songId]?.status || "not_started";
                          const { leftStatus, rightStatus } = getMoveOptions(currentStatus);

                          return (
                            <Draggable key={rs.songId} draggableId={rs.songId} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onClick={() => onSelectSong?.(rs.songId)}
                                  className={cn(
                                    "bg-background/60 border border-border/80 hover:border-[#383a3f] hover:bg-[#131416]/90 rounded-xl p-3.5 select-none transition-all duration-200 shadow-sm flex flex-col gap-2 group cursor-pointer flex-shrink-0",
                                    snapshot.isDragging
                                      ? "shadow-xl border-[#5b80a5] bg-[#1c1d21] scale-[1.03]"
                                      : ""
                                  )}
                                >
                                  <div className="flex items-center gap-3">
                                    {(() => {
                                      const coverSrc = song.albumArt
                                        ? song.albumArt
                                        : song.coverArtStoredName
                                          ? `/api/cover-art/${song.id}`
                                          : null;
                                      return coverSrc ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={coverSrc}
                                          alt=""
                                          className="w-10 h-10 rounded-lg object-cover border border-border flex-shrink-0"
                                        />
                                      ) : (
                                        <div className="w-10 h-10 rounded-lg bg-card border border-border flex items-center justify-center flex-shrink-0">
                                          <Music className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                      );
                                    })()}
                                    <div className="min-w-0 flex-1">
                                      <h5 className="text-xs font-bold text-foreground truncate">
                                        {song.title}
                                      </h5>
                                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                        {song.artist}
                                      </p>
                                    </div>
                                  </div>

                                  {(() => {
                                    const tunings = getSongTunings(song);
                                    if (tunings.length === 0) return null;
                                    return (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {tunings.map((ind) => {
                                          const isHighlighted =
                                            ind.role.toLowerCase() ===
                                            preferredInstrument.toLowerCase();
                                          return (
                                            <Badge
                                              key={`${ind.role}-${ind.tuning}`}
                                              className={cn(
                                                "text-[8px] font-mono tracking-wide px-1.5 py-0.5 border shrink-0",
                                                isHighlighted
                                                  ? "bg-[#2e4057]/45 border-[#446285]/55 text-[#acd1f8]"
                                                  : "bg-card/40 border-border text-[#6c727a]"
                                              )}
                                            >
                                              {ind.tuning}
                                            </Badge>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}

                                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60 flex-shrink-0">
                                    {leftStatus ? (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void onSaveProgress(song.id, leftStatus);
                                        }}
                                        className="text-muted-foreground hover:text-foreground p-1 bg-card/45 hover:bg-muted border border-border/60 rounded-lg transition-all"
                                        title={`Move to ${getLabel(leftStatus)}`}
                                      >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                      </button>
                                    ) : (
                                      <div className="w-7" />
                                    )}

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onPracticeSong?.(song.id);
                                      }}
                                      className="text-[#acd1f8] hover:text-white p-1 hover:bg-[#2e4057]/45 border border-[#2e4057]/30 rounded-lg transition-all flex items-center justify-center gap-1 text-[9px] font-bold px-2 h-7"
                                      title="Practice Song"
                                    >
                                      <Play className="w-2.5 h-2.5 fill-current" />
                                      Practice
                                    </button>

                                    {rightStatus ? (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void onSaveProgress(song.id, rightStatus);
                                        }}
                                        className="text-muted-foreground hover:text-foreground p-1 bg-card/45 hover:bg-muted border border-border/60 rounded-lg transition-all"
                                        title={`Move to ${getLabel(rightStatus)}`}
                                      >
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      </button>
                                    ) : (
                                      <div className="w-7" />
                                    )}
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}
