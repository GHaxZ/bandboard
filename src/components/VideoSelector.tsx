"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { searchYouTubeVideosAction } from "@/app/actions/songs";
import { Loader2, Search, Play, Check, Video } from "lucide-react";

interface VideoSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  trackId: string;
  type: "backing" | "tab";
  songTitle: string;
  songArtist: string;
  instrumentName: string;
  currentUrl: string | null;
  onSave: (url: string | null) => Promise<void>;
}

interface YouTubeVideo {
  videoId: string;
  title: string;
  channelName: string;
  viewsText: string;
  thumbnail: string;
  url: string;
}

export function VideoSelector({
  isOpen,
  onClose,
  trackId,
  type,
  songTitle,
  songArtist,
  instrumentName,
  currentUrl,
  onSave,
}: VideoSelectorProps) {
  const [query, setQuery] = useState("");
  const [manualUrl, setManualUrl] = useState(currentUrl || "");
  const [results, setResults] = useState<YouTubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Set default search queries
  useEffect(() => {
    if (isOpen) {
      setManualUrl(currentUrl || "");
      let defaultQuery = "";
      if (type === "backing") {
        if (instrumentName.toLowerCase().includes("bass")) {
          defaultQuery = `${songArtist} ${songTitle} bassless backing track`;
        } else if (instrumentName.toLowerCase().includes("drum")) {
          defaultQuery = `${songArtist} ${songTitle} drumless backing track`;
        } else if (instrumentName.toLowerCase().includes("guitar")) {
          defaultQuery = `${songArtist} ${songTitle} guitarless backing track`;
        } else if (instrumentName.toLowerCase().includes("vocal") || instrumentName.toLowerCase().includes("sing")) {
          defaultQuery = `${songArtist} ${songTitle} karaoke`;
        } else {
          defaultQuery = `${songArtist} ${songTitle} ${instrumentName} backing track`;
        }
      } else {
        defaultQuery = `${songArtist} ${songTitle} ${instrumentName} tab`;
      }
      setQuery(defaultQuery);
      handleSearch(defaultQuery);
    }
  }, [isOpen, trackId, type, songTitle, songArtist, instrumentName, currentUrl]);

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-[95vw] rounded-2xl max-h-[85vh] flex flex-col p-6 bg-[#161719] border border-[#27282b] text-[#f1f2f4]">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-[#f1f2f4]">
            <Video className="w-5 h-5 text-[#888d96]" />
            Select {type === "backing" ? "Backing Track" : "Tab Video"}
          </DialogTitle>
          <DialogDescription className="text-[#888d96] text-xs">
            Choose a video for <span className="font-bold text-[#f1f2f4]">{instrumentName}</span> on {songTitle}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 my-2">
          {/* Manual URL Input */}
          <div className="space-y-1.5">
            <Label htmlFor="manualUrl" className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider">
              Paste Direct Video URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="manualUrl"
                placeholder="https://youtube.com/watch?v=..."
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                className="bg-[#0c0d0e] border-[#27282b] text-[#f1f2f4] focus-visible:ring-[#5b80a5] focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
              />
              <Button 
                onClick={handleSaveManual} 
                disabled={isSaving}
                className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl font-semibold"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-[#27282b]"></div>
            <span className="flex-shrink mx-3 text-[10px] text-[#888d96] uppercase tracking-widest">Or Search YouTube</span>
            <div className="flex-grow border-t border-[#27282b]"></div>
          </div>

          {/* Search Section */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Search queries..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch(query)}
                className="bg-[#0c0d0e] border-[#27282b] text-[#f1f2f4] focus-visible:ring-[#5b80a5] focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
              />
              <Button 
                onClick={() => handleSearch(query)} 
                disabled={isLoading}
                className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {/* Results */}
            <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-8 text-[#888d96] gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-[#5b80a5]" />
                  <span className="text-xs">Searching YouTube...</span>
                </div>
              ) : results.length === 0 ? (
                <div className="text-center py-6 text-xs text-[#888d96]">
                  No videos found. Try a different query.
                </div>
              ) : (
                results.map((video) => {
                  const isCurrent = currentUrl === video.url;
                  return (
                    <button
                      key={video.videoId}
                      onClick={() => handleSelectVideo(video.url)}
                      disabled={isSaving}
                      className={`w-full text-left flex gap-3 p-2 rounded-xl border transition-all duration-200 ${
                        isCurrent
                          ? "bg-[#27282b] border-[#5b80a5]/50"
                          : "bg-[#0c0d0e]/40 border-[#27282b]/60 hover:bg-[#1c1d21]/60 hover:border-[#383a3f]"
                      }`}
                    >
                      {/* Thumbnail */}
                      <div className="relative w-24 aspect-video rounded-lg overflow-hidden bg-[#0c0d0e] flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={video.thumbnail}
                          alt=""
                          className="object-cover w-full h-full"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/10 transition-colors">
                          <Play className="w-4 h-4 text-white drop-shadow" />
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div>
                          <p className="text-xs font-medium text-[#f1f2f4] line-clamp-2 leading-snug">
                            {video.title}
                          </p>
                          <p className="text-[10px] text-[#888d96] mt-0.5 truncate">
                            {video.channelName}
                          </p>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-[#888d96]">
                            {video.viewsText}
                          </p>
                          {isCurrent && (
                            <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#f1f2f4] bg-[#27282b] px-1.5 py-0.5 rounded-full border border-[#3b3e45]">
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
        </div>

        <DialogFooter className="mt-2 pt-3 border-t border-[#27282b]">
          <Button 
            variant="ghost" 
            onClick={onClose}
            className="text-[#888d96] hover:text-[#f1f2f4] hover:bg-[#27282b] rounded-xl border border-transparent"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
