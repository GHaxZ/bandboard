"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { convertRehearsalToVote } from "@/app/actions/votes";
import { Loader2, Vote as VoteIcon } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/FormError";
import { cn, defaultVotingEnd, toDateTimeLocal } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { VOTE_SELECTION_MIN } from "@/lib/constants";

interface ConvertToVoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  rehearsal: {
    id: string;
    title: string;
    date: number;
    notes: string | null;
    /** Previous vote settings — used for autofill when re-voting. */
    votingEndsAt: number | null;
    songSelectionCount: number | null;
  };
  onSuccess: () => void;
}

export function ConvertToVoteModal({
  isOpen,
  onClose,
  rehearsal,
  onSuccess,
}: ConvertToVoteModalProps) {
  const [votingEndsStr, setVotingEndsStr] = useState("");
  const [selectionCount, setSelectionCount] = useState("3");
  // Pristine value + picker floor, captured at open-time so render stays pure.
  const [baselineEndsStr, setBaselineEndsStr] = useState("");
  const [minEndsStr, setMinEndsStr] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Autofill vote settings from the rehearsal's previous vote state when it
  // has one AND it is still in the future; otherwise fall back to the preset.
  // Title/date/notes are NOT editable here — the conversion action doesn't
  // accept them, so editing would silently discard input.
  useEffect(() => {
    if (!isOpen) return;
    const baseline =
      rehearsal.votingEndsAt !== null && rehearsal.votingEndsAt > Date.now()
        ? rehearsal.votingEndsAt
        : defaultVotingEnd(rehearsal.date);
    const baselineStr = toDateTimeLocal(baseline);
    setVotingEndsStr(baselineStr);
    setBaselineEndsStr(baselineStr);
    setMinEndsStr(toDateTimeLocal(Date.now()));
    setSelectionCount(String(rehearsal.songSelectionCount ?? 3));
  }, [isOpen, rehearsal]);

  const hasUnsavedChanges = useMemo(() => {
    if (!isOpen) return false;
    return (
      votingEndsStr !== baselineEndsStr ||
      selectionCount !== String(rehearsal.songSelectionCount ?? 3)
    );
  }, [isOpen, votingEndsStr, baselineEndsStr, selectionCount, rehearsal]);

  async function doSubmit(): Promise<boolean> {
    if (!votingEndsStr) return false;

    setIsLoading(true);
    setError(null);

    try {
      const endsTs = new Date(votingEndsStr).getTime();
      if (isNaN(endsTs)) throw new Error("Invalid voting end date or time");
      if (endsTs <= Date.now()) {
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

      const res = await convertRehearsalToVote(rehearsal.id, endsTs, count);
      if (res.success) {
        toast.success("Voting created");
        onSuccess();
        onClose();
        return true;
      }
      setError(res.error || "An error occurred.");
      return false;
    } catch (err) {
      console.error(err);
      setError("Failed to create the voting. Please verify your inputs.");
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
            <VoteIcon className="w-5 h-5 text-muted-foreground" />
            Turn into Song Vote
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            The current setlist becomes the candidate list. Members nominate and vote; the top
            songs become the new setlist when the voting ends. Title, date and notes stay
            unchanged — edit them on the rehearsal page.
            {rehearsal.votingEndsAt !== null &&
              " Previous votes and comments from earlier rounds are restored."}
          </DialogDescription>
        </DialogHeader>

        {/* ponytail: footer scrolls with the form; pin it only if this reads badly */}
        <form onSubmit={handleSubmit} className="space-y-4 my-2 min-h-0 overflow-y-auto px-3 -mx-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="convertVotingEnds"
              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
            >
              Voting Ends
            </Label>
            <Input
              id="convertVotingEnds"
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
              htmlFor="convertSelectionCount"
              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
            >
              Songs to Select
            </Label>
            <Input
              id="convertSelectionCount"
              type="number"
              min={VOTE_SELECTION_MIN}
              required
              disabled={isLoading}
              value={selectionCount}
              onChange={(e) => setSelectionCount(e.target.value)}
              className="rounded-xl w-full"
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
              disabled={isLoading || !votingEndsStr}
              className={cn(
                "rounded-xl shadow-md font-bold px-5 flex items-center gap-1.5 transition-all duration-300",
                !isLoading && !!votingEndsStr
                  ? "bg-success hover:bg-success/90 border border-success/50 text-white shadow-lg shadow-success/30 motion-reduce:animate-none"
                  : "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Converting...
                </>
              ) : (
                <>
                  <VoteIcon className="w-4 h-4" /> Create Voting
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
        title="Discard this voting?"
        description="The entered settings will be lost. The rehearsal stays unchanged."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        destructive
      />
    </Dialog>
  );
}
