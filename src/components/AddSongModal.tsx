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

  const isReady = title.trim().length > 0 && artist.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !artist.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      if (mode === "cover") {
        const res = await ingestSongData(title, artist);
        if (res.success) {
          toast.success("Cover song added");
          setTitle("");
          setArtist("");
          onSuccess();
          onClose();
        } else {
          setError(res.error || "An error occurred during ingestion.");
        }
      } else {
        const res = await createOriginalSong(title, artist);
        if (res.success && res.songId) {
          toast.success("Original song created");
          setTitle("");
          setArtist("");
          onSuccess();
          onClose();
          router.push(`/songs/${res.songId}`);
        } else {
          setError(res.error || "Failed to create original song.");
        }
      }
    } catch (err) {
      console.error(err);
      setError("Failed to reach server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open && !isLoading) {
      onClose();
      setMode("cover");
      setError(null);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md w-[95vw] rounded-2xl p-6 bg-card border border-border text-foreground">
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

        <form onSubmit={handleSubmit} className="space-y-4 my-2">
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
              className="bg-background border-border text-foreground focus-visible:border-ring rounded-xl"
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
              className="bg-background border-border text-foreground focus-visible:border-ring rounded-xl"
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
              disabled={isLoading || !isReady}
              className={cn(
                "rounded-xl shadow-md font-bold px-5 flex items-center gap-1.5 transition-all duration-300",
                isReady && !isLoading
                  ? "bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse motion-reduce:animate-none"
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
    </Dialog>
  );
}
