"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RehearsalDateTimeFieldsProps {
  /** datetime-local string: "YYYY-MM-DDTHH:mm" */
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  id?: string;
}

/** Single native date+time input, shared by the add/edit rehearsal modals. */
export function RehearsalDateTimeFields({
  value,
  onChange,
  disabled,
  id = "rehearsalDateTimeInput",
}: RehearsalDateTimeFieldsProps) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
      >
        Date &amp; Time
      </Label>
      <Input
        id={id}
        type="datetime-local"
        required
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl w-full"
      />
    </div>
  );
}
