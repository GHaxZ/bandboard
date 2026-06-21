"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
      <DialogContent className="max-w-md w-[95vw] rounded-2xl p-6 bg-[#161719] border border-[#27282b] text-[#f1f2f4]">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-[#f1f2f4]">
            <Music className="w-5 h-5 text-[#888d96]" />
            Add Song to Library
          </DialogTitle>
          <DialogDescription className="text-[#888d96] text-xs">
            Enter details. We will query public sources for notations, tunings, backing tracks, and lesson videos in the background.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 my-2">
          {/* Song Title */}
          <div className="space-y-1.5">
            <Label htmlFor="songTitle" className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider">
              Song Title
            </Label>
            <Input
              id="songTitle"
              required
              disabled={isLoading}
              placeholder="e.g. Plush"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-[#0c0d0e] border-[#27282b] text-[#f1f2f4] focus-visible:ring-[#5b80a5] focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
            />
          </div>

          {/* Artist/Band Name */}
          <div className="space-y-1.5">
            <Label htmlFor="artistName" className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider">
              Artist / Band Name
            </Label>
            <Input
              id="artistName"
              required
              disabled={isLoading}
              placeholder="e.g. Stone Temple Pilots"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="bg-[#0c0d0e] border-[#27282b] text-[#f1f2f4] focus-visible:ring-[#5b80a5] focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
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
              disabled={isLoading || !title.trim() || !artist.trim()}
              className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl shadow-md font-bold px-5 flex items-center gap-1.5"
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
