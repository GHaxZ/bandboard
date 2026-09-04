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
import { cn, toDateTimeLocal } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { VOTE_SELECTION_MIN } from "@/lib/constants";

interface EditRehearsalModalProps {
  isOpen: boolean;
  onClose: () => void;
  rehearsal: {
    id: string;
    title: string;
    date: number;
    notes: string | null;
  };
  /** Present while editing an open vote: shows + submits the vote settings. */
  voting?: { votingEndsAt: number; songSelectionCount: number } | null;
  onSuccess: () => void;
}

export function EditRehearsalModal({ isOpen, onClose, rehearsal, voting, onSuccess }: EditRehearsalModalProps) {
  const [title, setTitle] = useState(rehearsal.title);
  const [dateTimeStr, setDateTimeStr] = useState("");
  const [notes, setNotes] = useState(rehearsal.notes || "");
  const [votingEndsStr, setVotingEndsStr] = useState("");
  const [selectionCount, setSelectionCount] = useState("3");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  // Picker floor for the voting-end input, captured at open-time so render
  // stays pure (react-hooks/purity). Empty = no min.
  const [minEndsStr, setMinEndsStr] = useState("");

  // Pre-compute the "original" snapshot for dirty detection (runs once per open)
  const original = useMemo(() => {
    if (!isOpen || !rehearsal) return null;
    return {
      title: rehearsal.title,
      notes: rehearsal.notes || "",
      dateTime: toDateTimeLocal(rehearsal.date),
      ...(voting
        ? {
            votingEnds: toDateTimeLocal(voting.votingEndsAt),
            selectionCount: String(voting.songSelectionCount),
          }
        : {}),
    };
  }, [isOpen, rehearsal, voting]);

  useEffect(() => {
    if (isOpen && rehearsal) {
      setTitle(rehearsal.title);
      setNotes(rehearsal.notes || "");
      setDateTimeStr(toDateTimeLocal(rehearsal.date));
      if (voting) {
        setVotingEndsStr(toDateTimeLocal(voting.votingEndsAt));
        setSelectionCount(String(voting.songSelectionCount));
        // ponytail: no min when the stored end is already past — native
        // rangeUnderflow would block even title-only saves.
        setMinEndsStr(
          voting.votingEndsAt > Date.now() ? toDateTimeLocal(Date.now()) : ""
        );
      }
    }
  }, [isOpen, rehearsal, voting]);

  const hasUnsavedChanges = useMemo(() => {
    if (!original) return false;
    if (
      title !== original.title ||
      notes !== original.notes ||
      dateTimeStr !== original.dateTime
    ) {
      return true;
    }
    if (voting && original.votingEnds !== undefined) {
      return (
        votingEndsStr !== original.votingEnds ||
        selectionCount !== original.selectionCount
      );
    }
    return false;
  }, [title, notes, dateTimeStr, votingEndsStr, selectionCount, original, voting]);

  async function doSubmit(): Promise<boolean> {
    if (!title.trim() || !dateTimeStr) return false;

    setIsLoading(true);
    setError(null);

    try {
      const timestamp = new Date(dateTimeStr).getTime();
      if (isNaN(timestamp)) throw new Error("Invalid date or time selected");

      let opts: { votingEndsAt: number; songSelectionCount: number } | undefined;
      if (voting) {
        const endsTs = new Date(votingEndsStr).getTime();
        if (isNaN(endsTs)) throw new Error("Invalid voting end date or time");
        // Unchanged stored end may be past (expired-but-open vote) — only a
        // CHANGED end has to be in the future.
        if (endsTs !== voting.votingEndsAt && endsTs <= Date.now()) {
          setError("Voting end must be in the future.");
          setIsLoading(false);
          return false;
        }
        const count = Math.round(Number(selectionCount));
        if (!Number.isInteger(count) || count < VOTE_SELECTION_MIN) {
          setError(`Songs to select must be an integer of at least ${VOTE_SELECTION_MIN}.`);
          setIsLoading(false);
          return false;
        }
        opts = { votingEndsAt: endsTs, songSelectionCount: count };
      }

      const res = await updateRehearsal(rehearsal.id, title, timestamp, notes, opts);
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
      <DialogContent className="max-w-md w-[95vw] max-h-[85dvh] flex flex-col gap-4">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            Edit Rehearsal Details
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Modify title, date/time scheduling, and instructions for this rehearsal session.
          </DialogDescription>
        </DialogHeader>

        {/* ponytail: footer scrolls with the form; pin it only if this reads badly */}
        <form onSubmit={handleSubmit} className="space-y-4 my-2 min-h-0 overflow-y-auto px-3 -mx-3">
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
              className="rounded-xl"
            />
          </div>

          <RehearsalDateTimeFields
            value={dateTimeStr}
            onChange={setDateTimeStr}
            disabled={isLoading}
          />

          {voting && (
            <>
              <RehearsalDateTimeFields
                id="editVotingEnds"
                label="Voting Ends"
                min={minEndsStr || undefined}
                value={votingEndsStr}
                onChange={setVotingEndsStr}
                disabled={isLoading}
              />

              <div className="space-y-1.5">
                <Label
                  htmlFor="editSelectionCount"
                  className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                >
                  Songs to Select
                </Label>
                <Input
                  id="editSelectionCount"
                  type="number"
                  min={VOTE_SELECTION_MIN}
                  required
                  disabled={isLoading}
                  value={selectionCount}
                  onChange={(e) => setSelectionCount(e.target.value)}
                  className="rounded-xl w-full"
                />
              </div>
            </>
          )}

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

          <DialogFooter>
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
              disabled={isLoading || !hasUnsavedChanges || !title.trim() || !dateTimeStr}
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
