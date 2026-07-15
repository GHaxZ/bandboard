"use client";

import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface PracticeButtonProps {
  onClick?: () => void;
  className?: string;
  size?: "default" | "sm" | "icon";
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
      variant="practice"
      onClick={onClick}
      size={size === "icon" ? "icon" : size === "sm" ? "sm" : "default"}
      className={cn(
        "transition-all duration-200 cursor-pointer shadow-sm",
        className
      )}
      title={title}
    >
      <Play className={cn(
        "fill-current",
        size === "sm" || size === "icon" ? "w-3.5 h-3.5" : "w-4 h-4"
      )} />
      {size !== "icon" && children}
    </Button>
  );
}
