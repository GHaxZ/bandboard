"use client";

import { Music } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE_MAP = {
  sm: "w-8 h-8",
  md: "w-12 h-12",
  lg: "w-14 h-14",
} as const;

const ICON_SIZE_MAP = {
  sm: "w-3.5 h-3.5",
  md: "w-5 h-5",
  lg: "w-6 h-6",
} as const;

export function getCoverArtUrl(
  song: { id: string; coverArtStoredName: string | null; albumArt: string | null },
): string | null {
  if (song.coverArtStoredName) return `/api/cover-art/${song.id}`;
  if (song.albumArt) return song.albumArt;
  return null;
}

interface CoverArtProps {
  song: { id: string; coverArtStoredName: string | null; albumArt: string | null };
  size?: keyof typeof SIZE_MAP;
  className?: string;
}

export function CoverArt({ song, size = "md", className }: CoverArtProps) {
  const src = getCoverArtUrl(song);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn(
          SIZE_MAP[size],
          "rounded-xl object-cover border border-border flex-shrink-0",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        SIZE_MAP[size],
        "rounded-xl border border-border flex-shrink-0 flex items-center justify-center bg-muted/30",
        className,
      )}
    >
      <Music className={cn(ICON_SIZE_MAP[size], "text-muted-foreground")} />
    </div>
  );
}
