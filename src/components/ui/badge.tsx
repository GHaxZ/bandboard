import * as React from "react"
import { cn } from "@/lib/utils"

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-md border border-[#27282b] bg-[#161719]/60 px-2 py-0.5 text-[10px] font-bold font-mono tracking-wide text-[#b8c2d1] transition-all hover:bg-[#27282b] hover:text-[#f1f2f4]",
        className
      )}
      {...props}
    />
  )
}

export { Badge }
