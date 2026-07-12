"use client";

import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface PracticeButtonProps {
  onClick?: () => void;
  className?: string;
  size?: "default" | "sm" | "icon" | "h-9";
  title?: string;
  children?: React.ReactNode;
}

export function PracticeButton({
  onClick,
  className,
  size = "default",
  title = "Start Practice Mode",
  children = "Practice",
}: PracticeButtonProps) {
  return (
    <Button
      onClick={onClick}
      className={cn(
        "bg-[#1b2330] hover:bg-[#202b3c] border border-[#2e4057] text-[#acd1f8] hover:text-foreground rounded-xl transition-all duration-200 flex items-center gap-2 cursor-pointer font-bold text-xs shadow-sm",
        size === "sm"
          ? "h-8 px-3 text-[11px]"
          : size === "h-9"
            ? "h-9 px-4"
            : size === "icon"
              ? "h-8 w-8 p-0 justify-center"
              : "h-10 px-4",
        className
      )}
      title={title}
    >
      <Play
        className={cn(
          "fill-current text-[#acd1f8]",
          size === "sm" || size === "icon" ? "w-3.5 h-3.5" : "w-4 h-4"
        )}
      />
      {size !== "icon" && children}
    </Button>
  );
}
