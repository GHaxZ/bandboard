"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RehearsalDateTimeFieldsProps {
  dateStr: string;
  setDateStr: (v: string) => void;
  hourStr: string;
  setHourStr: (v: string) => void;
  minuteStr: string;
  setMinuteStr: (v: string) => void;
  disabled?: boolean;
}

/** Build a Unix-ms timestamp from the (already validated) date/time parts. */
export function toTimestamp(dateStr: string, hourStr: string, minuteStr: string): number {
  return new Date(`${dateStr}T${hourStr}:${minuteStr}:00`).getTime();
}

/** Date input + hour/minute selects, shared by the add/edit rehearsal modals. */
export function RehearsalDateTimeFields({
  dateStr,
  setDateStr,
  hourStr,
  setHourStr,
  minuteStr,
  setMinuteStr,
  disabled,
}: RehearsalDateTimeFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label
          htmlFor="rehearsalDateInput"
          className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
        >
          Select Date
        </Label>
        <Input
          id="rehearsalDateInput"
          type="date"
          required
          disabled={disabled}
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          className="bg-background border-border text-foreground focus-visible:border-ring rounded-xl w-full"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Select Time
        </Label>
        <div className="flex items-center gap-1.5">
          <select
            disabled={disabled}
            value={hourStr}
            onChange={(e) => setHourStr(e.target.value)}
            className="bg-background border border-border text-foreground focus-visible:border-ring rounded-xl p-2 text-sm flex-1 focus:outline-none h-10"
          >
            {Array.from({ length: 24 }).map((_, i) => {
              const h = String(i).padStart(2, "0");
              return (
                <option key={h} value={h} className="bg-card">
                  {h}
                </option>
              );
            })}
          </select>
          <span className="text-muted-foreground font-bold">:</span>
          <select
            disabled={disabled}
            value={minuteStr}
            onChange={(e) => setMinuteStr(e.target.value)}
            className="bg-background border border-border text-foreground focus-visible:border-ring rounded-xl p-2 text-sm flex-1 focus:outline-none h-10"
          >
            {Array.from({ length: 12 }).map((_, i) => {
              const m = String(i * 5).padStart(2, "0");
              return (
                <option key={m} value={m} className="bg-card">
                  {m}
                </option>
              );
            })}
          </select>
        </div>
      </div>
    </div>
  );
}
