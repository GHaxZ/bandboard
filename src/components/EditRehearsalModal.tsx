"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updateRehearsal } from "@/app/actions/rehearsals";
import { Loader2, Calendar, Save } from "lucide-react";

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
  const [timeStr, setTimeStr] = useState("");
  const [notes, setNotes] = useState(rehearsal.notes || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const minutes = String(d.getMinutes()).padStart(2, "0");

      setDateStr(`${year}-${month}-${day}`);
      setTimeStr(`${hours}:${minutes}`);
    }
  }, [isOpen, rehearsal]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !dateStr || !timeStr) return;

    setIsLoading(true);
    setError(null);

    try {
      const timestamp = new Date(`${dateStr}T${timeStr}`).getTime();
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
      <DialogContent className="max-w-md w-[95vw] rounded-2xl p-6 bg-[#161719] border border-[#27282b] text-[#f1f2f4]">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-[#f1f2f4]">
            <Calendar className="w-5 h-5 text-[#888d96]" />
            Edit Rehearsal Details
          </DialogTitle>
          <DialogDescription className="text-[#888d96] text-xs">
            Modify title, date/time scheduling, and instructions for this rehearsal session.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 my-2">
          {/* Rehearsal Title */}
          <div className="space-y-1.5">
            <Label htmlFor="editRehearsalTitle" className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider">
              Rehearsal Title
            </Label>
            <Input
              id="editRehearsalTitle"
              required
              disabled={isLoading}
              placeholder="e.g. Rehearsal Prep - June 24"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-[#0c0d0e] border-[#27282b] text-[#f1f2f4] focus-visible:ring-[#5b80a5] focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
            />
          </div>

          {/* Date & Time Picker Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="editRehearsalDate" className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider">
                Select Date
              </Label>
              <Input
                id="editRehearsalDate"
                type="date"
                required
                disabled={isLoading}
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="bg-[#0c0d0e] border-[#27282b] text-[#f1f2f4] focus-visible:ring-[#5b80a5] focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editRehearsalTime" className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider">
                Select Time
              </Label>
              <Input
                id="editRehearsalTime"
                type="time"
                required
                disabled={isLoading}
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
                className="bg-[#0c0d0e] border-[#27282b] text-[#f1f2f4] focus-visible:ring-[#5b80a5] focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl w-full"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="editRehearsalNotes" className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider">
              Notes / Location (Optional)
            </Label>
            <textarea
              id="editRehearsalNotes"
              disabled={isLoading}
              rows={3}
              placeholder="e.g. Studio Room B. Focus on transitions."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#0c0d0e] border border-[#27282b] text-[#f1f2f4] focus-visible:ring-[#5b80a5] rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#5b80a5] placeholder-[#555860]"
            />
          </div>

          {error && (
            <div className="text-xs font-semibold text-red-400 bg-red-950/20 border border-red-900/30 rounded-xl p-3 leading-relaxed">
              {error}
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-[#27282b] gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              disabled={isLoading}
              onClick={onClose}
              className="text-[#888d96] hover:text-[#f1f2f4] hover:bg-[#27282b] rounded-xl border border-transparent"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !title.trim() || !dateStr || !timeStr}
              className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl shadow-md font-bold px-5 flex items-center gap-1.5"
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
