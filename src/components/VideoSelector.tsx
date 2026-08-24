"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Button } from "@/components/ui/button";
import { CustomMediaPreview } from "./CustomMediaPreview";
import { cn } from "@/lib/utils";
import { searchYouTubeVideosAction } from "@/app/actions/songs";
import { Loader2, Search, Play, Check, Video, Upload, TriangleAlert } from "lucide-react";
import { getYouTubeQuery } from "@/lib/youtube-query";
import {
  ALLOWED_UPLOAD_MIMES,
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT,
  browserCanPlay,
} from "@/lib/constants";
import type { YouTubeVideo } from "@/lib/youtube";
import type { CustomTrack } from "@/types/models";

/** Staged (unsaved) media choice for one roleGroup slot. Owned by SongDashboard.
 *  Replacing either source (YouTube ↔ file) implicitly removes the other on save. */
export type MediaDraft =
  | { kind: "youtube"; url: string }
  | { kind: "custom"; file: File; previewUrl: string };

interface VideoSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  trackId: string;
  type: "backing" | "tab";
  role: string;
  songTitle: string;
  songArtist: string;
  instrumentName: string;
  currentUrl: string | null;
  currentCustomTrackId: string | null;
  /** Resolved bound track, so a saved file renders like a freshly staged one. */
  currentCustomTrack: CustomTrack | null;
  draft: MediaDraft | null;
  onDraftChange: (draft: MediaDraft | null) => void;
}

export function VideoSelector({
  isOpen,
  onClose,
  trackId,
  type,
  role,
  songTitle,
  songArtist,
  instrumentName,
  currentUrl,
  currentCustomTrackId,
  currentCustomTrack,
  draft,
  onDraftChange,
}: VideoSelectorProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  /** Persistent playback-support notice; shown while an undecodable file is staged. */
  const [customWarn, setCustomWarn] = useState<string | null>(null);

  // Tracks the latest search request — responses from an older in-flight
  // request (auto-search on open racing a manual search) are ignored.
  const searchRequestIdRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setCustomError(null);
      setCustomWarn(null);
      const defaultQuery = getYouTubeQuery(songArtist, songTitle, role, type, instrumentName);
      setQuery(defaultQuery);
      if (defaultQuery.trim()) {
        const requestId = ++searchRequestIdRef.current;
        setIsLoading(true);
        searchYouTubeVideosAction(defaultQuery)
          .then((videos) => {
            if (requestId === searchRequestIdRef.current) setResults(videos);
          })
          .catch((e) => console.error(e))
          .finally(() => {
            if (requestId === searchRequestIdRef.current) setIsLoading(false);
          });
      }
    }
  }, [isOpen, trackId, type, role, songTitle, songArtist, instrumentName]);

  async function handleSearch(searchQuery: string) {
    if (!searchQuery.trim()) return;
    const requestId = ++searchRequestIdRef.current;
    setIsLoading(true);
    try {
      const videos = await searchYouTubeVideosAction(searchQuery);
      if (requestId === searchRequestIdRef.current) setResults(videos);
    } catch (e) {
      console.error(e);
    } finally {
      if (requestId === searchRequestIdRef.current) setIsLoading(false);
    }
  }

  function handleCustomFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    // Clear the input so re-selecting the same file still fires onChange.
    e.target.value = "";
    if (!selected) return;
    if (!ALLOWED_UPLOAD_MIMES.includes(selected.type)) {
      setCustomError(`File type not allowed: ${selected.type}`);
      return;
    }
    if (selected.size > MAX_UPLOAD_BYTES) {
      setCustomError(`File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB).`);
      return;
    }
    setCustomError(null);
    setCustomWarn(
      browserCanPlay(selected.type)
        ? null
        : `This browser can't decode ${selected.type || "this format"}. It will still upload fine, but playback here may not work.`
    );
    onDraftChange({
      kind: "custom",
      file: selected,
      previewUrl: URL.createObjectURL(selected),
    });
  }

  // --- What the dialog presents as "selected" ---
  // Staged draft wins; otherwise mirror persisted state. Staging a custom
  // file or a removal immediately deselects the YouTube side (the file
  // replaces it on save); a YouTube draft deselects the custom file.
  const shownUrl =
    draft?.kind === "youtube"
      ? draft.url
      : draft || currentCustomTrackId
        ? null
        : currentUrl;
  const stagedCustom = draft?.kind === "custom" ? draft : null;
  // A bound (already saved) file shows the same card as a staged one — minus
  // the pending note. Any staged draft hides it (replacement is implicit).
  const shownCustom = stagedCustom
    ? {
        key: stagedCustom.previewUrl,
        name: stagedCustom.file.name,
        sizeBytes: stagedCustom.file.size,
        previewUrl: stagedCustom.previewUrl,
        isVideo: stagedCustom.file.type.startsWith("video/"),
        pending: true,
      }
    : !draft && currentCustomTrack
      ? {
          key: currentCustomTrack.id,
          name: currentCustomTrack.fileName || currentCustomTrack.label,
          sizeBytes: currentCustomTrack.sizeBytes,
          previewUrl: `/api/uploads/${currentCustomTrack.id}`,
          isVideo: currentCustomTrack.isVideo,
          pending: false,
        }
      : null;
  const customHighlighted = !!shownCustom;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-[95vw] max-h-[85vh] flex flex-col">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Video className="w-5 h-5 text-muted-foreground" />
            Change {type === "backing" ? "Backing Track" : "Tab Video"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Pick a source for <span className="font-bold text-foreground">{instrumentName}</span> on{" "}
            {songTitle}. Your selection is applied when you save.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 my-2">
          {/* --- YouTube Section --- */}
          <div
            className={cn(
              "rounded-2xl border p-4 space-y-3 transition-colors",
              shownUrl
                ? "border-success/50 bg-success/5"
                : "border-border bg-background/30"
            )}
          >
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-destructive" />
              <span className="text-xs font-bold text-foreground uppercase tracking-wider flex-1">
                YouTube
              </span>
              {shownUrl && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-success border border-success/40 bg-success/10 px-1.5 py-0.5 rounded-full">
                  <Check className="w-2.5 h-2.5" /> Selected
                </span>
              )}
            </div>

            {/* Manual URL */}
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={shownUrl ?? ""}
              onChange={(e) => onDraftChange({ kind: "youtube", url: e.target.value })}
              className="text-xs"
            />

            {/* Search */}
            <div className="flex gap-2 items-stretch">
              <Input
                placeholder="Search YouTube..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch(query)}
                className="text-xs flex-1"
              />
              <Button
                onClick={() => handleSearch(query)}
                disabled={isLoading}
                variant="secondary"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {/* Results */}
            <div className="space-y-2 max-h-[30vh] overflow-y-auto pr-1">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-xs">Searching YouTube...</span>
                </div>
              ) : results.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  No videos found. Try a different query.
                </div>
              ) : (
                results.map((video) => {
                  const isSelected = !!shownUrl && shownUrl === video.url;
                  return (
                    <button
                      key={video.videoId}
                      onClick={() => onDraftChange({ kind: "youtube", url: video.url })}
                      className={cn(
                        "w-full text-left flex gap-3 p-2 rounded-xl border transition-all duration-200 cursor-pointer",
                        isSelected
                          ? "bg-accent-soft border-ring/60 ring-2 ring-ring/30"
                          : "bg-background/40 border-border/60 hover:bg-card/60 hover:border-ring/30"
                      )}
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
                          {isSelected && (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-full border border-success/40">
                              <Check className="w-2.5 h-2.5" /> Selected
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
              customHighlighted
                ? "border-success/50 bg-success/5"
                : "border-border bg-background/30"
            )}
          >
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-bold text-foreground uppercase tracking-wider flex-1">
                Custom
              </span>
              {customHighlighted && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-success border border-success/40 bg-success/10 px-1.5 py-0.5 rounded-full">
                  <Check className="w-2.5 h-2.5" /> Selected
                </span>
              )}
            </div>

            {shownCustom && (
              <div className="space-y-2 bg-muted/30 border border-border rounded-xl p-3">
                <span className="text-xs text-foreground font-medium truncate block">
                  {shownCustom.name}{" "}
                  <span className="text-muted-foreground">
                    ({(shownCustom.sizeBytes / 1024 / 1024).toFixed(1)} MB)
                  </span>
                </span>
                <CustomMediaPreview
                  key={shownCustom.key}
                  src={shownCustom.previewUrl}
                  isVideo={shownCustom.isVideo}
                  coverArtUrl={null}
                  label={shownCustom.name}
                />
                {shownCustom.pending && (
                  <p className="text-[10px] text-muted-foreground">
                    Uploads and applies when you save.
                  </p>
                )}
              </div>
            )}

            <FileInput accept={UPLOAD_ACCEPT} onChange={handleCustomFileChange} />

            {customWarn && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-600/30 dark:border-amber-800 bg-amber-500/10 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span className="leading-snug">{customWarn}</span>
              </div>
            )}
            {customError && (
              <p className="text-[10px] text-destructive font-medium">{customError}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} className="rounded-xl font-bold px-5">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
