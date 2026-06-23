"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateRehearsal } from "@/app/actions/rehearsals";
import { Loader2, Calendar, Save } from "lucide-react";
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

export function EditRehearsalModal({ isOpen, onClose, rehearsal, onSuccess }: EditRehearsalModalProps) {
  const [title, setTitle] = useState(rehearsal.title);
  const [dateStr, setDateStr] = useState("");
  const [hourStr, setHourStr] = useState("19");
  const [minuteStr, setMinuteStr] = useState("00");
  const [notes, setNotes] = useState(rehearsal.notes || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate initial date/time values to compare against current state
  const d = new Date(rehearsal?.date || 0);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const rawMins = d.getMinutes();
  const roundedMins = Math.round(rawMins / 5) * 5;
  const finalMins = roundedMins >= 60 ? 55 : roundedMins;
  const minutes = String(finalMins).padStart(2, "0");

  const initialTitle = rehearsal?.title || "";
  const initialNotes = rehearsal?.notes || "";
  const initialDateStr = rehearsal ? `${year}-${month}-${day}` : "";
  const initialHourStr = rehearsal ? hours : "19";
  const initialMinuteStr = rehearsal ? minutes : "00";

  const hasUnsavedChanges = rehearsal && (
    title !== initialTitle ||
    notes !== initialNotes ||
    dateStr !== initialDateStr ||
    hourStr !== initialHourStr ||
    minuteStr !== initialMinuteStr
  );

  // Initialize date and time strings from stored timestamp in local timezone
  useEffect(() => {
    if (isOpen && rehearsal) {
      setTitle(rehearsal.title);
      setNotes(rehearsal.notes || "");

      const d = new Date(rehearsal.date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      
      // Round minutes to nearest 5 for selector compatibility
      const rawMins = d.getMinutes();
      const roundedMins = Math.round(rawMins / 5) * 5;
      const finalMins = roundedMins >= 60 ? 55 : roundedMins;
      const minutes = String(finalMins).padStart(2, "0");

      setDateStr(`${year}-${month}-${day}`);
      setHourStr(hours);
      setMinuteStr(minutes);
    }
  }, [isOpen, rehearsal]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dateStr) return;

    setIsLoading(true);
    setError(null);

    try {
      const timestamp = new Date(`${dateStr}T${hourStr}:${minuteStr}:00`).getTime();
      if (isNaN(timestamp)) {
        throw new Error("Invalid date or time selected");
      }

      const res = await updateRehearsal(rehearsal.id, title, timestamp, notes);
      if (res.success) {
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
          {/* Rehearsal Title */}
          <div className="space-y-1.5">
            <Label htmlFor="editRehearsalTitle" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Rehearsal Title
            </Label>
            <Input
              id="editRehearsalTitle"
              required
              disabled={isLoading}
              placeholder="e.g. Rehearsal Prep - June 24"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
            />
          </div>

          {/* Date & Split Time Picker Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="editRehearsalDate" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Select Date
              </Label>
              <Input
                id="editRehearsalDate"
                type="date"
                required
                disabled={isLoading}
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl w-full"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Select Time
              </Label>
              <div className="flex items-center gap-1.5">
                <select
                  disabled={isLoading}
                  value={hourStr}
                  onChange={(e) => setHourStr(e.target.value)}
                  className="bg-background border border-border text-foreground focus:ring-1 focus:ring-ring focus:border-[#5b80a5] rounded-xl p-2 text-sm flex-1 focus:outline-none h-10"
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
                  disabled={isLoading}
                  value={minuteStr}
                  onChange={(e) => setMinuteStr(e.target.value)}
                  className="bg-background border border-border text-foreground focus:ring-1 focus:ring-ring focus:border-[#5b80a5] rounded-xl p-2 text-sm flex-1 focus:outline-none h-10"
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

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="editRehearsalNotes" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Notes / Location (Optional)
            </Label>
            <textarea
              id="editRehearsalNotes"
              disabled={isLoading}
              rows={3}
              placeholder="e.g. Studio Room B. Focus on transitions."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-background border border-border text-foreground focus-visible:ring-ring rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder-[#555860]"
            />
          </div>

          {error && (
            <div className="text-xs font-semibold text-red-400 bg-red-950/20 border border-red-900/30 rounded-xl p-3 leading-relaxed">
              {error}
            </div>
          )}

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
                  ? "bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse"
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
