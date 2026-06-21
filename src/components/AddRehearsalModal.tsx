"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createRehearsal } from "@/app/actions/rehearsals";
import { Loader2, Calendar, Plus } from "lucide-react";

interface AddRehearsalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (rehearsalId: string) => void;
}

export function AddRehearsalModal({ isOpen, onClose, onSuccess }: AddRehearsalModalProps) {
  const [title, setTitle] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const res = await createRehearsal(title, timestamp, notes);
      if (res.success && res.rehearsalId) {
        setTitle("");
        setDateStr("");
        setTimeStr("");
        setNotes("");
        onSuccess(res.rehearsalId);
        onClose();
      } else {
        setError(res.error || "An error occurred.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to create rehearsal. Please verify your inputs.");
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
            Schedule Rehearsal
          </DialogTitle>
          <DialogDescription className="text-[#888d96] text-xs">
            Set up a new rehearsal prep session. You will be able to build and order your setlist after creating it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 my-2">
          {/* Rehearsal Title */}
          <div className="space-y-1.5">
            <Label htmlFor="rehearsalTitle" className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider">
              Rehearsal Title
            </Label>
            <Input
              id="rehearsalTitle"
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
              <Label htmlFor="rehearsalDate" className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider">
                Select Date
              </Label>
              <Input
                id="rehearsalDate"
                type="date"
                required
                disabled={isLoading}
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="bg-[#0c0d0e] border-[#27282b] text-[#f1f2f4] focus-visible:ring-[#5b80a5] focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rehearsalTime" className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider">
                Select Time
              </Label>
              <Input
                id="rehearsalTime"
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
            <Label htmlFor="rehearsalNotes" className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider">
              Notes / Location (Optional)
            </Label>
            <textarea
              id="rehearsalNotes"
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
                  <Loader2 className="w-4 h-4 animate-spin" /> Scheduling...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Create Rehearsal
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
