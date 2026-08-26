"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { ingestSongData, createOriginalSong } from "@/app/actions/songs";
import { Loader2, Music, Plus, Compass } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/FormError";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { SongType } from "@/lib/constants";

interface AddSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddSongModal({ isOpen, onClose, onSuccess }: AddSongModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<SongType>("cover");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const isReady = title.trim().length > 0 && artist.trim().length > 0;

  async function doSubmit(): Promise<boolean> {
    if (!title.trim() || !artist.trim()) return false;

    setIsLoading(true);
    setError(null);

    try {
      if (mode === "cover") {
        const res = await ingestSongData(title, artist);
        if (res.success) {
          toast.success("Cover song added");
          setTitle("");
          setArtist("");
          setMode("cover"); // reset even though onClose() skips handleOpenChange
          onSuccess();
          onClose();
          return true;
        }
        setError(res.error || "An error occurred during ingestion.");
        return false;
      } else {
        const res = await createOriginalSong(title, artist);
        if (res.success && res.songId) {
          toast.success("Original song created");
          setTitle("");
          setArtist("");
          setMode("cover"); // reset even though onClose() skips handleOpenChange
          onSuccess();
          onClose();
          router.push(`/songs/${res.songId}`);
          return true;
        }
        setError(res.error || "Failed to create original song.");
        return false;
      }
    } catch (err) {
      console.error(err);
      setError("Failed to reach server. Please try again.");
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await doSubmit();
  }

  function closeAndReset() {
    onClose();
    setTitle("");
    setArtist("");
    setMode("cover");
    setError(null);
  }

  function requestClose() {
    if (isLoading) return;
    if (isReady) setConfirmDiscardOpen(true);
    else closeAndReset();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && requestClose()}>
      <DialogContent className="max-w-md w-[95vw] max-h-[85dvh] flex flex-col gap-4">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Music className="w-5 h-5 text-muted-foreground" />
            Add Song to Library
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            {mode === "cover"
              ? "Enter details. We will query public sources for notations, tunings, backing tracks, and lesson videos in the background."
              : "Create a blank original. You can upload stems, set tunings, and arrange the song in the editor afterward."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 rounded-xl bg-muted/30 border border-border p-1 w-fit">
          <button
            type="button"
            onClick={() => setMode("cover")}
            disabled={isLoading}
            className={
              mode === "cover"
                ? "px-3 py-1 text-[11px] font-bold rounded-lg bg-btn-bg text-foreground border border-dialog-border flex items-center gap-1.5"
                : "px-3 py-1 text-[11px] font-bold rounded-lg text-muted-foreground hover:text-foreground border border-transparent flex items-center gap-1.5"
            }
          >
            <Music className="w-3.5 h-3.5" />
            Cover
          </button>
          <button
            type="button"
            onClick={() => setMode("original")}
            disabled={isLoading}
            className={
              mode === "original"
                ? "px-3 py-1 text-[11px] font-bold rounded-lg bg-btn-bg text-foreground border border-dialog-border flex items-center gap-1.5"
                : "px-3 py-1 text-[11px] font-bold rounded-lg text-muted-foreground hover:text-foreground border border-transparent flex items-center gap-1.5"
            }
          >
            <Compass className="w-3.5 h-3.5" />
            Original
          </button>
        </div>

        {/* ponytail: footer scrolls with the form; pin it only if this reads badly */}
        <form onSubmit={handleSubmit} className="space-y-4 my-2 min-h-0 overflow-y-auto">
          <div className="space-y-1.5">
            <Label
              htmlFor="songTitle"
              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
            >
              Song Title
            </Label>
            <Input
              id="songTitle"
              required
              disabled={isLoading}
              placeholder="e.g. Plush"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="artistName"
              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
            >
              Artist / Band Name
            </Label>
            <Input
              id="artistName"
              required
              disabled={isLoading}
              placeholder="e.g. Stone Temple Pilots"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="rounded-xl"
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
                  <Loader2 className="w-4 h-4 animate-spin" /> {mode === "cover" ? "Ingesting..." : "Creating..."}
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Add {mode === "cover" ? "Cover" : "Original"}
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
          closeAndReset();
        }}
        title="Discard this song?"
        description="The entered details will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        destructive
      />
    </Dialog>
  );
}
