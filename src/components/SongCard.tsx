"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBadge } from "@/components/ProgressBadge";
import { TuningBadges } from "@/components/TuningBadges";
import { cn } from "@/lib/utils";
import type { Song, ProgressMap } from "@/types/models";
import type { Role } from "@/lib/constants";

interface SongCardProps {
  song: Song;
  progressMap: ProgressMap;
  preferredInstrument: Role | string;
  onPractice: (songId: string) => void;
}

export function SongCard({
  song,
  progressMap,
  preferredInstrument,
  onPractice,
}: SongCardProps) {
  const progStatus = progressMap[song.id]?.status || "not_started";
  const trackCount = song.roleGroups?.reduce((acc, rg) => acc + (rg.tracks?.length || 0), 0) || 0;

  return (
    <Link href={`/songs/${song.id}`} className="block h-full">
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
                {trackCount} notation tracks
              </span>
              <ProgressBadge status={progStatus} />
            </div>
            <CardTitle className="text-base font-bold text-[#d1d1d6] mt-1 truncate group-hover:text-foreground">
              {song.title}
            </CardTitle>
            <div className="flex flex-col gap-1.5 mt-1">
              <CardDescription className="text-xs text-muted-foreground truncate font-medium">
                by {song.artist}
              </CardDescription>
              <TuningBadges song={song} highlightRole={preferredInstrument} />
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
              onPractice(song.id);
            }}
            className={cn(
              "bg-[#2e4057] hover:bg-[#344b67] border border-[#446285] text-[#acd1f8] hover:text-[#cde3fa]",
              "font-bold text-xs rounded-xl flex items-center gap-1.5 h-8 px-3 shadow cursor-pointer transition-all"
            )}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Practice
          </Button>
        </div>
      </Card>
    </Link>
  );
}
