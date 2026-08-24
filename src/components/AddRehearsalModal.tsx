"use client";

import { useState } from "react";
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
import { createRehearsal } from "@/app/actions/rehearsals";
import { Loader2, Calendar, Plus } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/FormError";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface AddRehearsalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (rehearsalId: string) => void;
}

export function AddRehearsalModal({ isOpen, onClose, onSuccess }: AddRehearsalModalProps) {
  const [title, setTitle] = useState("");
  const [dateTimeStr, setDateTimeStr] = useState("");
  const [notes, setNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const isReady = title.trim().length > 0 && dateTimeStr.length > 0;

  async function doSubmit(): Promise<boolean> {
    if (!title.trim() || !dateTimeStr) return false;

    setIsLoading(true);
    setError(null);

    try {
      const timestamp = new Date(dateTimeStr).getTime();
      if (isNaN(timestamp)) throw new Error("Invalid date or time selected");

      const res = await createRehearsal(title, timestamp, notes);
      if (res.success && res.rehearsalId) {
        toast.success("Rehearsal created");
        setTitle("");
        setDateTimeStr("");
        setNotes("");
        onSuccess(res.rehearsalId);
        onClose();
        return true;
      }
      setError(res.error || "An error occurred.");
      return false;
    } catch (err) {
      console.error(err);
      setError("Failed to create rehearsal. Please verify your inputs.");
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
    if (isReady || notes) setConfirmDiscardOpen(true);
    else onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && requestClose()}>
      <DialogContent className="max-w-md w-[95vw] rounded-2xl p-6 bg-card border border-border text-foreground">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            Schedule Rehearsal
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Set up a new rehearsal prep session. You will be able to build and order your setlist
            after creating it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 my-2">
          <div className="space-y-1.5">
            <Label
              htmlFor="rehearsalTitle"
              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
            >
              Rehearsal Title
            </Label>
            <Input
              id="rehearsalTitle"
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
              htmlFor="rehearsalNotes"
              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
            >
              Notes / Location (Optional)
            </Label>
            <Textarea
              id="rehearsalNotes"
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
              disabled={isLoading || !isReady}
              className={cn(
                "rounded-xl shadow-md font-bold px-5 flex items-center gap-1.5 transition-all duration-300",
                isReady && !isLoading
                  ? "bg-success hover:bg-success/90 border border-success/50 text-white shadow-lg shadow-success/30 motion-reduce:animate-none"
                  : "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground"
              )}
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

      <ConfirmDialog
        isOpen={confirmDiscardOpen}
        onClose={() => setConfirmDiscardOpen(false)}
        onConfirm={() => {
          setConfirmDiscardOpen(false);
          onClose();
        }}
        title="Discard this rehearsal?"
        description="The entered details will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        destructive
      />
    </Dialog>
  );
}
