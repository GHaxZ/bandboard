import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "text-center py-16 bg-card/40 border border-border rounded-2xl p-6 text-muted-foreground",
        className
      )}
    >
      <Icon className="w-12 h-12 mx-auto mb-3 text-[#27282b]" />
      <h3 className="font-semibold text-lg text-foreground">{title}</h3>
      {description && <p className="text-sm mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
