import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrivateIndicatorProps {
  className?: string;
  tooltip?: string;
  text?: string;
}

export function PrivateIndicator({
  className,
  tooltip = "These settings are stored locally on your device and are private to you.",
  text = "Private",
}: PrivateIndicatorProps) {
  return (
    <span
      className={cn(
        "text-[10px] text-[#a7a7ad] font-bold bg-muted/50 border border-dialog-border/50 px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0",
        className
      )}
      title={tooltip}
    >
      <Lock className="w-3 h-3 text-muted-foreground" />
      {text}
    </span>
  );
}
