import * as React from "react";
import { cn } from "@/lib/utils";

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "field-glow h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground transition-colors focus-visible:border-ring/70 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 [&>option]:bg-card",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
