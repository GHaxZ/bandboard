"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface RehearsalDateTimeFieldsProps {
  /** datetime-local string: "YYYY-MM-DDTHH:mm" */
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
  min?: string;
}

/**
 * Single native date+time input, shared by the add/edit rehearsal modals and
 * the voting-ends fields. Native datetime-local renders blank when empty on
 * iOS Safari and a bare "dd.mm.yyyy, --:--" on desktop, so an empty value
 * gets a "Select date & time" overlay instead. Overlay hides while the input
 * is focused so the native picker UI takes over during editing.
 */
export function RehearsalDateTimeFields({
  value,
  onChange,
  disabled,
  id = "rehearsalDateTimeInput",
  label = "Date & Time",
  min,
}: RehearsalDateTimeFieldsProps) {
  const empty = !value;
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
      >
        {label}
      </Label>
      <div className="relative group">
        <Input
          id={id}
          type="datetime-local"
          required
          disabled={disabled}
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "rounded-xl w-full",
            empty && "text-transparent focus:text-foreground"
          )}
        />
        {empty && (
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 flex items-center px-3 text-base md:text-sm text-muted-foreground pointer-events-none group-focus-within:hidden",
              disabled && "opacity-50"
            )}
          >
            Select date &amp; time
          </span>
        )}
      </div>
    </div>
  );
}
