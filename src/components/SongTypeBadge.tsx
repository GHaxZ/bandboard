import { cn } from "@/lib/utils";
import { SONG_TYPE_BADGE, SONG_TYPE_LABEL } from "@/lib/constants";
import type { SongType } from "@/lib/constants";

interface SongTypeBadgeProps {
  songType: SongType | string;
  className?: string;
}

export function SongTypeBadge({ songType, className }: SongTypeBadgeProps) {
  const key = (songType as SongType) in SONG_TYPE_BADGE ? (songType as SongType) : "cover";
  const meta = SONG_TYPE_BADGE[key];
  return (
    <span
      className={cn(
        "text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border-0 shrink-0",
        meta.soft,
        meta.text,
        className
      )}
    >
      {SONG_TYPE_LABEL[key]}
    </span>
  );
}
