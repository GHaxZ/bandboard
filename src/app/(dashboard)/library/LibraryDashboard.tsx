"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Music as MusicIcon,
  Plus,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddSongModal } from "@/components/AddSongModal";
import { SearchInput } from "@/components/SearchInput";
import { getSongs } from "@/app/actions/songs";
import { getUserSettings, getAllSongProgress } from "@/app/actions/user";
import { getSongTunings } from "@/lib/tunings";
import { Song, ProgressMap } from "@/types/models";

interface LibraryDashboardProps {
  initialSongs: Song[];
  preferredInstrument: string;
  initialProgressMap: ProgressMap;
}

export function LibraryDashboard({ initialSongs, preferredInstrument, initialProgressMap }: LibraryDashboardProps) {
  const router = useRouter();
  const [songsList, setSongsList] = useState<Song[]>(initialSongs);
  const [songSearchQuery, setSongSearchQuery] = useState("");
  const [isAddSongOpen, setIsAddSongOpen] = useState(false);
  const [instrument, setInstrument] = useState(preferredInstrument);
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgressMap);
  const [, startTransition] = useTransition();

  async function refreshData() {
    startTransition(async () => {
      const updatedSongs = await getSongs();
      setSongsList(updatedSongs);

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
        <div className="text-center py-16 bg-card/40 border border-border rounded-2xl p-6 text-muted-foreground">
          <MusicIcon className="w-12 h-12 mx-auto mb-3 text-[#27282b]" />
          <h3 className="font-semibold text-lg text-foreground">No Songs Found</h3>
          <p className="text-sm mt-1">Add a new song to download notation tabs, backing tracks and scores.</p>
          <Button
            onClick={() => setIsAddSongOpen(true)}
            className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl mt-4 text-xs font-bold"
          >
            Add Your First Song
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSongs.map((song) => (
            <Link key={song.id} href={`/songs/${song.id}`} className="block h-full">
              <Card className="border-border bg-card/40 hover:bg-card/80 hover:border-[#383a3f] transition-all duration-200 cursor-pointer rounded-2xl overflow-hidden group shadow-lg py-0 h-full flex flex-col justify-between">
                <CardHeader className="p-5 flex flex-row items-center gap-4">
                  {song.albumArt && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={song.albumArt}
                      alt=""
                      className="w-12 h-12 rounded-xl object-cover border border-border flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
                        {(song.roleGroups?.reduce((acc, rg) => acc + (rg.tracks?.length || 0), 0) || 0)} notation tracks
                      </span>
                      {(() => {
                        const progStatus = progressMap[song.id]?.status || "not_started";
                        return (
                          <Badge
                            className={cn(
                              "text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border-0 shrink-0",
                              progStatus === "mastered"
                                ? "bg-purple-950/40 text-purple-400"
                                : progStatus === "ready_to_play"
                                ? "bg-emerald-950/40 text-emerald-400"
                                : progStatus === "learning"
                                ? "bg-sky-950/40 text-sky-400"
                                : "bg-red-950/40 text-red-400"
                            )}
                          >
                            {progStatus === "ready_to_play"
                              ? "Ready to Play"
                              : progStatus === "not_started"
                              ? "Not learned"
                              : progStatus === "learning"
                              ? "Learning"
                              : progStatus}
                          </Badge>
                        );
                      })()}
                    </div>
                    <CardTitle className="text-base font-bold text-[#d1d1d6] mt-1 truncate group-hover:text-foreground">
                      {song.title}
                    </CardTitle>
                    <div className="flex flex-col gap-1.5 mt-1">
                      <CardDescription className="text-xs text-muted-foreground truncate font-medium">
                        by {song.artist}
                      </CardDescription>

                      {/* Tuning Badges */}
                      {(() => {
                        const songTunings = getSongTunings(song);
                        if (songTunings.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1">
                            {songTunings.map((ind) => {
                              const isHighlighted = ind.role.toLowerCase() === instrument.toLowerCase();
                              return (
                                <Badge
                                  key={`${ind.role}-${ind.tuning}`}
                                  className={cn(
                                    "text-[9px] font-mono tracking-wide px-1.5 py-0.5 border",
                                    isHighlighted
                                      ? "bg-[#2e4057] border-[#446285] text-[#acd1f8] hover:bg-[#344b67] hover:text-[#cde3fa]"
                                      : "bg-card/40 border-border text-[#6c727a] hover:bg-[#1c1d21]/60 hover:text-[#b8c2d1]"
                                  )}
                                >
                                  {ind.tuning}
                                </Badge>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </CardHeader>
                <div className="border-t border-border/60 px-5 py-3.5 bg-transparent flex items-center justify-between gap-2 mt-auto">
                  <span className="text-[10px] text-muted-foreground font-mono tracking-wider">
                    {(song.roleGroups?.length || 0)} instrument roles
                  </span>
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push(`/songs/${song.id}/practice`);
                    }}
                    className="bg-[#2e4057] hover:bg-[#344b67] border border-[#446285] text-[#acd1f8] hover:text-[#cde3fa] font-bold text-xs rounded-xl flex items-center gap-1.5 h-8 px-3 shadow cursor-pointer transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Practice
                  </Button>
                </div>
              </Card>
            </Link>
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
