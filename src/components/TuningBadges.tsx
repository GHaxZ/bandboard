import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getSongTunings } from "@/lib/tunings";
import type { Song } from "@/types/models";
import type { Role } from "@/lib/constants";

interface TuningBadgesProps {
  song: Pick<Song, "roleGroups" | "tunings" | "songType">;
  highlightRole?: Role | string;
  className?: string;
  size?: "sm" | "xs";
  /** "ghost" (default): transparent background. "solid": filled highlight
   *  used on dense surfaces like the kanban cards and autoplay footer. */
  variant?: "ghost" | "solid";
}

export function TuningBadges({
  song,
  highlightRole,
  className,
  size = "sm",
  variant = "ghost",
}: TuningBadgesProps) {
  const tunings = getSongTunings(song);
  if (tunings.length === 0) return null;

  const sizeCls =
    size === "xs"
      ? "text-[7.5px] px-1.5 py-0.5 leading-none"
      : "text-[9px] px-1.5 py-0.5";

  const matchCls =
    variant === "solid"
      ? "bg-[#2e4057]/45 border-[#446285]/55 text-[#acd1f8]"
      : "border-[#446285] text-[#acd1f8] font-bold";
  const idleCls =
    variant === "solid"
      ? "bg-card/40 border-border text-[#6c727a]"
      : "border-border text-[#6c727a]";

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
              isMatch ? matchCls : idleCls
            )}
          >
            {ind.tuning}
          </Badge>
        );
      })}
    </div>
  );
}
