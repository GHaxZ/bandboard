"use client";

import { useState, useEffect } from "react";
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
import { Loader2, Calendar, Plus, Vote as VoteIcon, Music as MusicIcon } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/FormError";
import { cn, toDateTimeLocal } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { VOTE_SELECTION_MIN, REHEARSAL_TYPE_BADGE } from "@/lib/constants";
import type { RehearsalType } from "@/lib/constants";

interface AddRehearsalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (rehearsalId: string) => void;
}

export function AddRehearsalModal({ isOpen, onClose, onSuccess }: AddRehearsalModalProps) {
  const [rehearsalType, setRehearsalType] = useState<RehearsalType>("manual");
  const [title, setTitle] = useState("");
  const [dateTimeStr, setDateTimeStr] = useState("");
  const [notes, setNotes] = useState("");
  const [votingEndsStr, setVotingEndsStr] = useState("");
  const [selectionCount, setSelectionCount] = useState("3");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  // Picker floor for the voting-end input, captured at open-time so render
  // stays pure (react-hooks/purity).
  const [minEndsStr, setMinEndsStr] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setMinEndsStr(toDateTimeLocal(Date.now()));
  }, [isOpen]);

  const isReady =
    title.trim().length > 0 &&
    dateTimeStr.length > 0 &&
    (rehearsalType === "manual" || votingEndsStr.length > 0);

  async function doSubmit(): Promise<boolean> {
    if (!title.trim() || !dateTimeStr) return false;
    if (rehearsalType === "vote" && !votingEndsStr) return false;

    setIsLoading(true);
    setError(null);

    try {
      const timestamp = new Date(dateTimeStr).getTime();
      if (isNaN(timestamp)) throw new Error("Invalid date or time selected");

      let opts: { type: RehearsalType; votingEndsAt?: number; songSelectionCount?: number };
      if (rehearsalType === "vote") {
        const endsTs = new Date(votingEndsStr).getTime();
        if (isNaN(endsTs)) throw new Error("Invalid voting end date or time");
        if (endsTs <= Date.now()) {
          setError("Voting end must be in the future.");
          setIsLoading(false);
          return false;
        }
        if (endsTs > timestamp) {
          setError("Voting must end before the rehearsal starts.");
          setIsLoading(false);
          return false;
        }
        const count = Math.round(Number(selectionCount));
        if (!Number.isInteger(count) || count < VOTE_SELECTION_MIN) {
          setError(`Songs to select must be an integer of at least ${VOTE_SELECTION_MIN}.`);
          setIsLoading(false);
          return false;
        }
        opts = { type: "vote", votingEndsAt: endsTs, songSelectionCount: count };
      } else {
        opts = { type: "manual" };
      }

      const res = await createRehearsal(title, timestamp, notes, opts);
      if (res.success && res.rehearsalId) {
        toast.success(rehearsalType === "vote" ? "Voting created" : "Rehearsal created");
        setTitle("");
        setDateTimeStr("");
        setNotes("");
        setVotingEndsStr("");
        setSelectionCount("3");
        setRehearsalType("manual");
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

  // Discard must actually clear the draft — otherwise reopening shows a
  // phantom-valid form that re-triggers the discard prompt on close.
  function resetForm() {
    setError(null);
    setTitle("");
    setDateTimeStr("");
    setNotes("");
    setVotingEndsStr("");
    setSelectionCount("3");
    setRehearsalType("manual");
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && requestClose()}>
      <DialogContent className="max-w-md w-[95vw] max-h-[85dvh] flex flex-col gap-4">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            Schedule Rehearsal
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Create a classic session with a hand-built setlist, or a song vote that lets the band
            decide the setlist.
          </DialogDescription>
        </DialogHeader>

        {/* ponytail: footer scrolls with the form; pin it only if this reads badly */}
        <form onSubmit={handleSubmit} className="space-y-4 my-2 min-h-0 overflow-y-auto px-3 -mx-3">
          {/* Type picker — mirrors the Session/Vote badge colors */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setRehearsalType("manual")}
              className={cn(
                "flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer disabled:opacity-50",
                rehearsalType === "manual"
                  ? "bg-muted border-ring/40 shadow-md shadow-black/20"
                  : "bg-background/40 border-border/80 hover:bg-card/60 hover:border-ring/30"
              )}
            >
              <MusicIcon
                className={cn(
                  "w-4 h-4",
                  rehearsalType === "manual" ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="text-xs font-bold text-foreground">Rehearsal Session</span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                Build and order the setlist yourself.
              </span>
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setRehearsalType("vote")}
              className={cn(
                "flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer disabled:opacity-50",
                rehearsalType === "vote"
                  ? cn(REHEARSAL_TYPE_BADGE.vote.soft, REHEARSAL_TYPE_BADGE.vote.border, "shadow-md shadow-black/20")
                  : "bg-background/40 border-border/80 hover:bg-card/60 hover:border-ring/30"
              )}
            >
              <VoteIcon
                className={cn(
                  "w-4 h-4",
                rehearsalType === "vote"
                  ? REHEARSAL_TYPE_BADGE.vote.text
                  : "text-muted-foreground"
                )}
              />
              <span className="text-xs font-bold text-foreground">Song Vote</span>
              <span className="text-[10px] text-muted-foreground leading-tight">
                Members nominate and vote; top songs become the setlist.
              </span>
            </button>
          </div>

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
              className="rounded-xl"
            />
          </div>

          <RehearsalDateTimeFields
            value={dateTimeStr}
            onChange={setDateTimeStr}
            disabled={isLoading}
          />

          {rehearsalType === "vote" && (
            <>
              <div className="space-y-1.5">
                <Label
                  htmlFor="votingEndsInput"
                  className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                >
                  Voting Ends
                </Label>
                <Input
                  id="votingEndsInput"
                  type="datetime-local"
                  required
                  disabled={isLoading}
                  min={minEndsStr || undefined}
                  value={votingEndsStr}
                  onChange={(e) => setVotingEndsStr(e.target.value)}
                  className="rounded-xl w-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="selectionCountInput"
                  className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                >
                  Songs to Select
                </Label>
                <Input
                  id="selectionCountInput"
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
                  <Plus className="w-4 h-4" />
                  {rehearsalType === "vote" ? "Create Voting" : "Create Rehearsal"}
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
          resetForm();
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
