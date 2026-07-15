import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function LoadingState({ label = "Loading…", className, size = "md" }: LoadingStateProps) {
  const iconSize = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-8 h-8" : "w-6 h-6";
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-12", className)}>
      <Loader2 className={cn(iconSize, "animate-spin text-muted-foreground")} />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
