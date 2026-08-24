import * as React from "react";
import { cn } from "@/lib/utils";

function FileInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="file"
      data-slot="file-input"
      className={cn(
        "field-glow w-full cursor-pointer rounded-xl border border-border bg-background p-2 text-xs text-muted-foreground transition-colors focus-visible:border-ring/70 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-btn-bg file:px-4 file:py-2 file:font-bold file:text-foreground file:hover:bg-btn-hover",
        className,
      )}
      {...props}
    />
  );
}

export { FileInput };
