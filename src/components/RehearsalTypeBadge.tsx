import { cn } from "@/lib/utils";
import { REHEARSAL_TYPE_BADGE, REHEARSAL_TYPE_LABEL } from "@/lib/constants";
import type { RehearsalType } from "@/lib/constants";

interface RehearsalTypeBadgeProps {
  rehearsalType: RehearsalType | string;
  className?: string;
}

/** "Session" vs "Vote" chip — mirrors SongTypeBadge for rehearsals. */
export function RehearsalTypeBadge({ rehearsalType, className }: RehearsalTypeBadgeProps) {
  const key = (rehearsalType as RehearsalType) in REHEARSAL_TYPE_BADGE
    ? (rehearsalType as RehearsalType)
    : "manual";
  const meta = REHEARSAL_TYPE_BADGE[key];
  return (
    <span
      className={cn(
        "text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border-0 shrink-0",
        meta.soft,
        meta.text,
        className
      )}
    >
      {REHEARSAL_TYPE_LABEL[key]}
    </span>
  );
}
