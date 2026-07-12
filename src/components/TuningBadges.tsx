import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getSongTunings } from "@/lib/tunings";
import type { Song } from "@/types/models";
import type { Role } from "@/lib/constants";

interface TuningBadgesProps {
  song: Pick<Song, "roleGroups">;
  highlightRole?: Role | string;
  className?: string;
  size?: "sm" | "xs";
}

export function TuningBadges({
  song,
  highlightRole,
  className,
  size = "sm",
}: TuningBadgesProps) {
  const tunings = getSongTunings(song);
  if (tunings.length === 0) return null;

  const sizeCls =
    size === "xs"
      ? "text-[7.5px] px-1.5 py-0.5 leading-none"
      : "text-[9px] px-1.5 py-0.5";

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tunings.map((ind) => {
        const isMatch = highlightRole
          ? ind.role.toLowerCase() === highlightRole.toLowerCase()
          : false;
        return (
          <Badge
            key={`${ind.role}-${ind.tuning}`}
            className={cn(
              "font-mono tracking-wide border shrink-0 bg-transparent",
              sizeCls,
              isMatch
                ? "border-[#446285] text-[#acd1f8] font-bold"
                : "border-border text-[#6c727a]"
            )}
          >
            {ind.tuning}
          </Badge>
        );
      })}
    </div>
  );
}
