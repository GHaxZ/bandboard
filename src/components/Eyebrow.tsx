import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EyebrowProps {
  children: ReactNode;
  className?: string;
}

/** Extra-small uppercase label used as field headers / section titles. */
export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <span className={cn("text-[10px] font-bold text-muted-foreground uppercase tracking-wider", className)}>
      {children}
    </span>
  );
}
