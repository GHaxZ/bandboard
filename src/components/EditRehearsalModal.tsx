"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RehearsalDateTimeFields, toTimestamp } from "./RehearsalDateTimeFields";
import { updateRehearsal } from "@/app/actions/rehearsals";
import { Loader2, Calendar, Save } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/FormError";
import { cn } from "@/lib/utils";

interface EditRehearsalModalProps {
  isOpen: boolean;
  onClose: () => void;
  rehearsal: {
    id: string;
    title: string;
    date: number;
    notes: string | null;
  };
  onSuccess: () => void;
}

function computeDateParts(ts: number) {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  let hours = d.getHours();
  const rawMins = d.getMinutes();
  let roundedMins = Math.round(rawMins / 5) * 5;
  if (roundedMins === 60) {
    // e.g. 19:58 → 20:00, not a clamped 19:55 (the old code snapped
    // backwards and could never pre-fill :00 of the next hour).
    roundedMins = 0;
    hours = (hours + 1) % 24;
  }
  const hourStr = String(hours).padStart(2, "0");
  const minutes = String(roundedMins).padStart(2, "0");
  return { year, month, day, hours: hourStr, minutes, dateStr: `${year}-${month}-${day}` };
}

export function EditRehearsalModal({ isOpen, onClose, rehearsal, onSuccess }: EditRehearsalModalProps) {
  const [title, setTitle] = useState(rehearsal.title);
  const [dateStr, setDateStr] = useState("");
  const [hourStr, setHourStr] = useState("19");
  const [minuteStr, setMinuteStr] = useState("00");
  const [notes, setNotes] = useState(rehearsal.notes || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-compute the "original" snapshot for dirty detection (runs once per open)
  const original = useMemo(() => {
    if (!isOpen || !rehearsal) return null;
    return {
      title: rehearsal.title,
      notes: rehearsal.notes || "",
      ...computeDateParts(rehearsal.date),
    };
  }, [isOpen, rehearsal]);

  useEffect(() => {
    if (isOpen && rehearsal) {
      setTitle(rehearsal.title);
      setNotes(rehearsal.notes || "");
      const parts = computeDateParts(rehearsal.date);
      setDateStr(parts.dateStr);
      setHourStr(parts.hours);
      setMinuteStr(parts.minutes);
    }
  }, [isOpen, rehearsal]);

  const hasUnsavedChanges = useMemo(() => {
    if (!original) return false;
    return (
      title !== original.title ||
      notes !== original.notes ||
      dateStr !== original.dateStr ||
      hourStr !== original.hours ||
      minuteStr !== original.minutes
    );
  }, [title, notes, dateStr, hourStr, minuteStr, original]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dateStr) return;

    setIsLoading(true);
    setError(null);

    try {
      const timestamp = toTimestamp(dateStr, hourStr, minuteStr);
      if (isNaN(timestamp)) throw new Error("Invalid date or time selected");
      const res = await updateRehearsal(rehearsal.id, title, timestamp, notes);
      if (res.success) {
        toast.success("Rehearsal updated");
        onSuccess();
        onClose();
      } else {
        setError(res.error || "An error occurred.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to update rehearsal. Please check your input fields.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="max-w-md w-[95vw] rounded-2xl p-6 bg-card border border-border text-foreground">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            Edit Rehearsal Details
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Modify title, date/time scheduling, and instructions for this rehearsal session.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 my-2">
          <div className="space-y-1.5">
            <Label
              htmlFor="editRehearsalTitle"
              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
            >
              Rehearsal Title
            </Label>
            <Input
              id="editRehearsalTitle"
              required
              disabled={isLoading}
              placeholder="e.g. Rehearsal Prep - June 24"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-background border-border text-foreground focus-visible:border-ring rounded-xl"
            />
          </div>

          <RehearsalDateTimeFields
            dateStr={dateStr}
            setDateStr={setDateStr}
            hourStr={hourStr}
            setHourStr={setHourStr}
            minuteStr={minuteStr}
            setMinuteStr={setMinuteStr}
            disabled={isLoading}
          />

          <div className="space-y-1.5">
            <Label
              htmlFor="editRehearsalNotes"
              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
            >
              Notes / Location (Optional)
            </Label>
            <Textarea
              id="editRehearsalNotes"
              disabled={isLoading}
              rows={3}
              placeholder="e.g. Studio Room B. Focus on transitions."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <FormError>{error}</FormError>

          <DialogFooter className="pt-3 border-t border-border gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              disabled={isLoading}
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl border border-transparent"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !title.trim() || !dateStr}
              className={cn(
                "rounded-xl shadow-md font-bold px-5 flex items-center gap-1.5 transition-all duration-300",
                hasUnsavedChanges && !isLoading
                  ? "bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse motion-reduce:animate-none"
                  : "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
