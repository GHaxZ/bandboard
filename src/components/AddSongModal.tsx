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
import { Label } from "@/components/ui/label";
import { ingestSongData } from "@/app/actions/songs";
import { Loader2, Music, Plus } from "lucide-react";

interface AddSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddSongModal({ isOpen, onClose, onSuccess }: AddSongModalProps) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !artist.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await ingestSongData(title, artist);
      if (res.success) {
        setTitle("");
        setArtist("");
        onSuccess();
        onClose();
      } else {
        setError(res.error || "An error occurred during ingestion.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to reach server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="max-w-md w-[95vw] rounded-2xl p-6 bg-card border border-border text-foreground">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Music className="w-5 h-5 text-muted-foreground" />
            Add Song to Library
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Enter details. We will query public sources for notations, tunings, backing tracks,
            and lesson videos in the background.
          </DialogDescription>
        </DialogHeader>

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
              className="bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
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
              className="bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
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
              disabled={isLoading || !title.trim() || !artist.trim()}
              className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl shadow-md font-bold px-5 flex items-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Ingesting...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Add Song
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
