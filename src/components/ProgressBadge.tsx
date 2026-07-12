import { cn } from "@/lib/utils";
import { progressStatusMeta } from "@/lib/constants";
import type { ProgressStatus } from "@/lib/constants";

interface ProgressBadgeProps {
  status: ProgressStatus | string;
  className?: string;
}

export function ProgressBadge({ status, className }: ProgressBadgeProps) {
  const meta = progressStatusMeta(status);
  return (
    <span
      className={cn(
        "text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-md border-0 shrink-0",
        meta.soft,
        meta.text,
        className
      )}
    >
      {meta.label}
    </span>
  );
}
