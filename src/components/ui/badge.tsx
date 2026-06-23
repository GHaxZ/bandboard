import * as React from "react"
import { cn } from "@/lib/utils"

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-card/60 px-2 py-0.5 text-[10px] font-bold font-mono tracking-wide text-[#b8c2d1] transition-all hover:bg-muted hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Badge }
