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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { searchYouTubeVideosAction } from "@/app/actions/songs";
import { Loader2, Search, Play, Check, Video, Upload } from "lucide-react";
import { getYouTubeQuery } from "@/lib/youtube-query";
import { ALLOWED_UPLOAD_MIMES, MAX_UPLOAD_BYTES } from "@/lib/constants";
import type { YouTubeVideo } from "@/lib/youtube";

interface VideoSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  trackId: string;
  type: "backing" | "tab";
  role: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  instrumentName: string;
  currentUrl: string | null;
  currentCustomTrackId: string | null;
  onSave: (url: string | null) => Promise<void>;
  onSaveCustom: (customTrackId: string | null) => Promise<void>;
}

export function VideoSelector({
  isOpen,
  onClose,
  trackId,
  type,
  role,
  songId,
  songTitle,
  songArtist,
  instrumentName,
  currentUrl,
  currentCustomTrackId,
  onSave,
  onSaveCustom,
}: VideoSelectorProps) {
  const [query, setQuery] = useState("");
  const [manualUrl, setManualUrl] = useState(currentUrl || "");
  const [results, setResults] = useState<YouTubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [isUploadingCustom, setIsUploadingCustom] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [uploadedId, setUploadedId] = useState<string | null>(null);

  const youtubeInUse = !currentCustomTrackId && !!currentUrl;
  const customInUse = !!currentCustomTrackId;

  useEffect(() => {
    if (isOpen) {
      setManualUrl(currentUrl || "");
      setCustomFile(null);
      setCustomError(null);
      setUploadedId(null);
      const defaultQuery = getYouTubeQuery(songArtist, songTitle, role, type, instrumentName);
      setQuery(defaultQuery);
      if (defaultQuery.trim()) {
        setIsLoading(true);
        searchYouTubeVideosAction(defaultQuery)
          .then((videos) => setResults(videos))
          .catch((e) => console.error(e))
          .finally(() => setIsLoading(false));
      }
    }
  }, [isOpen, trackId, type, role, songTitle, songArtist, instrumentName, currentUrl]);

  async function handleSearch(searchQuery: string) {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    try {
      const videos = await searchYouTubeVideosAction(searchQuery);
      setResults(videos);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectVideo(url: string) {
    setIsSaving(true);
    try {
      await onSave(url);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveManual() {
    setIsSaving(true);
    try {
      const url = manualUrl.trim() ? manualUrl.trim() : null;
      await onSave(url);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  }

  function handleCustomFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setCustomFile(selected);
    setCustomError(null);
    setUploadedId(null);
    // Auto-upload and save immediately on file selection
    void handleUploadCustom(selected);
  }

  async function handleUploadCustom(file: File) {
    if (!ALLOWED_UPLOAD_MIMES.includes(file.type)) {
      setCustomError(`File type not allowed: ${file.type}`);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setCustomError("File too large (max 100MB).");
      return;
    }
    setIsUploadingCustom(true);
    setCustomError(null);
    try {
      const form = new FormData();
      form.append("songId", songId);
      form.append("role", role);
      form.append("label", file.name.replace(/\.[^.]+$/, ""));
      form.append("file", file);
      form.append("kind", "artifact");
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      toast.success("Custom file uploaded!");
      setUploadedId(data.track.id);
      await onSaveCustom(data.track.id);
      // ponytail: keep dialog open after custom upload so the user can upload
      // more or switch to a YouTube result. The "In use" badge updates via
      // currentCustomTrackId after onRefresh. YouTube selection still closes
      // the dialog (handleSelectVideo / handleSaveManual call onClose()).
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setIsUploadingCustom(false);
    }
  }

  async function handleRemoveCustom() {
    setIsSaving(true);
    try {
      await onSaveCustom(null);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-[95vw] rounded-2xl max-h-[85vh] flex flex-col p-6 bg-card border border-border text-foreground">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Video className="w-5 h-5 text-muted-foreground" />
            Change {type === "backing" ? "Backing Track" : "Tab Video"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Choose a video for <span className="font-bold text-foreground">{instrumentName}</span> on{" "}
            {songTitle}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 my-2">
          {/* --- YouTube Section --- */}
          <div
            className={cn(
              "rounded-2xl border p-4 space-y-3 transition-colors",
              youtubeInUse
                ? "border-emerald-600/60 bg-emerald-950/10"
                : "border-border bg-background/30"
            )}
          >
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-red-400" />
              <span className="text-xs font-bold text-foreground uppercase tracking-wider flex-1">
                YouTube
              </span>
              {youtubeInUse && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-700/50 bg-emerald-950/30 px-1.5 py-0.5 rounded-full">
                  <Check className="w-2.5 h-2.5" /> In use
                </span>
              )}
            </div>

            {/* Manual URL */}
            <div className="flex gap-2">
              <Input
                placeholder="https://youtube.com/watch?v=..."
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                className="bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl text-xs"
              />
              <Button
                onClick={handleSaveManual}
                disabled={isSaving}
                className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl font-semibold text-xs h-9"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>

            {/* Search */}
            <div className="flex gap-2">
              <Input
                placeholder="Search YouTube..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch(query)}
                className="bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl text-xs"
              />
              <Button
                onClick={() => handleSearch(query)}
                disabled={isLoading}
                className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {/* Results */}
            <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#5b80a5]" />
                  <span className="text-xs">Searching YouTube...</span>
                </div>
              ) : results.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  No videos found. Try a different query.
                </div>
              ) : (
                results.map((video) => {
                  const isCurrent = currentUrl === video.url && !currentCustomTrackId;
                  return (
                    <button
                      key={video.videoId}
                      onClick={() => handleSelectVideo(video.url)}
                      disabled={isSaving}
                      className={`w-full text-left flex gap-3 p-2 rounded-xl border transition-all duration-200 ${
                        isCurrent
                          ? "bg-muted border-[#5b80a5]/50"
                          : "bg-background/40 border-border/60 hover:bg-[#1c1d21]/60 hover:border-[#383a3f]"
                      }`}
                    >
                      <div className="relative w-20 aspect-video rounded-lg overflow-hidden bg-background flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={video.thumbnail} alt="" className="object-cover w-full h-full" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/10 transition-colors">
                          <Play className="w-4 h-4 text-white drop-shadow" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div>
                          <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                            {video.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {video.channelName}
                          </p>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-muted-foreground">{video.viewsText}</p>
                          {isCurrent && (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-foreground bg-muted px-1.5 py-0.5 rounded-full border border-dialog-border">
                              <Check className="w-2.5 h-2.5" /> Current
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* --- Custom Section --- */}
          <div
            className={cn(
              "rounded-2xl border p-4 space-y-3 transition-colors",
              customInUse
                ? "border-emerald-600/60 bg-emerald-950/10"
                : "border-border bg-background/30"
            )}
          >
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-bold text-foreground uppercase tracking-wider flex-1">
                Custom
              </span>
              {customInUse && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-700/50 bg-emerald-950/30 px-1.5 py-0.5 rounded-full">
                  <Check className="w-2.5 h-2.5" /> In use
                </span>
              )}
            </div>

            {currentCustomTrackId && (
              <div className="flex items-center justify-between gap-2 bg-muted/30 border border-border rounded-xl p-3">
                <span className="text-xs text-foreground font-medium truncate">
                  Custom {type === "backing" ? "backing" : "tab"} file bound
                </span>
                <Button
                  onClick={handleRemoveCustom}
                  disabled={isSaving}
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300 hover:bg-red-950/20 text-[10px] font-bold rounded-lg"
                >
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Remove"}
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="file"
                accept="audio/*,video/*"
                onChange={handleCustomFileChange}
                disabled={isSaving || isUploadingCustom}
                className="flex-1 w-full text-xs text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-btn-bg file:text-foreground file:font-bold file:cursor-pointer file:hover:bg-btn-hover cursor-pointer bg-background border border-border rounded-xl p-2"
              />
              {isUploadingCustom && (
                <div className="flex items-center justify-center px-3">
                  <Loader2 className="w-4 h-4 animate-spin text-[#5b80a5]" />
                </div>
              )}
              {uploadedId && customFile && !isUploadingCustom && (
                <div className="flex items-center justify-center px-3">
                  <Check className="w-4 h-4 text-emerald-400" />
                </div>
              )}
            </div>
            {customError && (
              <p className="text-[10px] text-red-400 font-medium">{customError}</p>
            )}
          </div>
        </div>

        <DialogFooter className="mt-2 pt-3 border-t border-border">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl border border-transparent"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
