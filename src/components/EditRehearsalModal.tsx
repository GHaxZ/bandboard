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
import { RehearsalDateTimeFields } from "./RehearsalDateTimeFields";
import { updateRehearsal } from "@/app/actions/rehearsals";
import { Loader2, Calendar, Save } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/FormError";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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

function toDateTimeLocal(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function EditRehearsalModal({ isOpen, onClose, rehearsal, onSuccess }: EditRehearsalModalProps) {
  const [title, setTitle] = useState(rehearsal.title);
  const [dateTimeStr, setDateTimeStr] = useState("");
  const [notes, setNotes] = useState(rehearsal.notes || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Pre-compute the "original" snapshot for dirty detection (runs once per open)
  const original = useMemo(() => {
    if (!isOpen || !rehearsal) return null;
    return {
      title: rehearsal.title,
      notes: rehearsal.notes || "",
      dateTime: toDateTimeLocal(rehearsal.date),
    };
  }, [isOpen, rehearsal]);

  useEffect(() => {
    if (isOpen && rehearsal) {
      setTitle(rehearsal.title);
      setNotes(rehearsal.notes || "");
      setDateTimeStr(toDateTimeLocal(rehearsal.date));
    }
  }, [isOpen, rehearsal]);

  const hasUnsavedChanges = useMemo(() => {
    if (!original) return false;
    return (
      title !== original.title ||
      notes !== original.notes ||
      dateTimeStr !== original.dateTime
    );
  }, [title, notes, dateTimeStr, original]);

  async function doSubmit(): Promise<boolean> {
    if (!title.trim() || !dateTimeStr) return false;

    setIsLoading(true);
    setError(null);

    try {
      const timestamp = new Date(dateTimeStr).getTime();
      if (isNaN(timestamp)) throw new Error("Invalid date or time selected");
      const res = await updateRehearsal(rehearsal.id, title, timestamp, notes);
      if (res.success) {
        toast.success("Rehearsal updated");
        onSuccess();
        onClose();
        return true;
      }
      setError(res.error || "An error occurred.");
      return false;
    } catch (err) {
      console.error(err);
      setError("Failed to update rehearsal. Please check your input fields.");
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doSubmit();
  }

  function requestClose() {
    if (isLoading) return;
    if (hasUnsavedChanges) setConfirmDiscardOpen(true);
    else onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && requestClose()}>
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
            value={dateTimeStr}
            onChange={setDateTimeStr}
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
              onClick={requestClose}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl border border-transparent"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !title.trim() || !dateTimeStr}
              className={cn(
                "rounded-xl shadow-md font-bold px-5 flex items-center gap-1.5 transition-all duration-300",
                hasUnsavedChanges && !isLoading
                  ? "bg-success hover:bg-success/90 border border-success/50 text-white shadow-lg shadow-success/30 motion-reduce:animate-none"
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

      <ConfirmDialog
        isOpen={confirmDiscardOpen}
        onClose={() => setConfirmDiscardOpen(false)}
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          onClose();
        }}
        title="Discard unsaved changes?"
        description="Your edits to this rehearsal will be lost."
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
        destructive
      />
    </Dialog>
  );
}
