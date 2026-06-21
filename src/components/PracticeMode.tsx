"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Music,
  Video,
  ArrowLeft,
  Sliders,
  Loader2,
  ExternalLink,
  FileText,
  Play,
  Save,
  Trash2,
  Settings,
  Bookmark
} from "lucide-react";
import {
  saveSongProgress,
  saveUserSettings,
  savePracticeMarkers
} from "@/app/actions/user";
import { updateRoleGroupStartOffsets } from "@/app/actions/songs";

interface Track {
  id: string;
  roleGroupId: string;
  instrumentName: string;
  role: string;
  details: string | null;
  tuning: string;
  tabLink: string;
}

interface RoleGroup {
  id: string;
  songId: string;
  role: string;
  backingTrackLink: string | null;
  tabVideoLink: string | null;
  backingStartOffset?: number | null;
  tabStartOffset?: number | null;
  tracks: Track[];
}

interface Song {
  id: string;
  title: string;
  artist: string;
  songsterrId: number | null;
  albumArt: string | null;
  createdAt: number;
  roleGroups: RoleGroup[];
}

interface PracticeModeProps {
  song: Song;
  onExit: () => void;
  onRefresh: () => void;
  progressMap: Record<string, { status: string; speed: number; notes: string | null; practiceMarkers?: string | null }>;
}

function getYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  return match ? match[1] : null;
}

function useYoutubeApi() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).YT && (window as any).YT.Player) {
      setLoaded(true);
      return;
    }

    let script = document.getElementById("youtube-iframe-api") as HTMLScriptElement;
    if (!script) {
      script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(script, firstScriptTag);
    }

    const previousReady = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      if (previousReady) previousReady();
      setLoaded(true);
    };

    const interval = setInterval(() => {
      if ((window as any).YT && (window as any).YT.Player) {
        setLoaded(true);
        clearInterval(interval);
      }
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return loaded;
}

export function PracticeMode({ song, onExit, onRefresh, progressMap }: PracticeModeProps) {
  const apiLoaded = useYoutubeApi();
  
  // Track selection
  const [activeTrackId, setActiveTrackId] = useState<string>("");
  const [initializedSongId, setInitializedSongId] = useState<string | null>(null);

  // Video playback
  const [activeVideo, setActiveVideo] = useState<"backing" | "tab">("backing");
  const backingPlayerRef = useRef<any>(null);
  const tabPlayerRef = useRef<any>(null);

  // Practice state logs
  const [progressStatus, setProgressStatus] = useState<string>("learning");
  const [progressSpeed, setProgressSpeed] = useState<number>(100);
  const [progressNotes, setProgressNotes] = useState<string>("");
  const [isSavingProgress, setIsSavingProgress] = useState<boolean>(false);

  // Practice markers (user-specific timestamps)
  const [markers, setMarkers] = useState<number[]>([]);

  // Start Sync Offsets (global)
  const [backingOffset, setBackingOffset] = useState<string>("0");
  const [tabOffset, setTabOffset] = useState<string>("0");
  const [isSavingOffsets, setIsSavingOffsets] = useState<boolean>(false);

  const standardRoleGroups = song.roleGroups.filter((rg) => rg.role !== "Other");
  const otherRoleGroup = song.roleGroups.find((rg) => rg.role === "Other");
  const otherTracks = otherRoleGroup?.tracks || [];

  // Get active role details
  const activeRoleGroup = standardRoleGroups.find((rg) => rg.id === activeTrackId);
  const backingVideoId = activeRoleGroup ? getYouTubeId(activeRoleGroup.backingTrackLink) : null;
  const tabVideoId = activeRoleGroup ? getYouTubeId(activeRoleGroup.tabVideoLink) : null;
  const hasBothVideos = !!(backingVideoId && tabVideoId);

  // 1. Smart default instrument initialization
  useEffect(() => {
    const isStandardValid = standardRoleGroups.some((rg) => rg.id === activeTrackId);
    
    if (!isStandardValid || song.id !== initializedSongId) {
      const preferredRole = localStorage.getItem("bandboard_instrument") || "Guitar";
      const matchingRoleGroup = standardRoleGroups.find(
        (rg) => rg.role.toLowerCase() === preferredRole.toLowerCase()
      );

      if (matchingRoleGroup) {
        setActiveTrackId(matchingRoleGroup.id);
      } else if (standardRoleGroups.length > 0) {
        setActiveTrackId(standardRoleGroups[0].id);
      } else if (otherTracks.length > 0) {
        setActiveTrackId("other-tab");
      }
      setInitializedSongId(song.id);
    }
  }, [song, activeTrackId, initializedSongId]);

  // Load progress details & user-specific practice markers
  useEffect(() => {
    const prog = progressMap[song.id];
    if (prog) {
      setProgressStatus(prog.status);
      setProgressSpeed(prog.speed);
      setProgressNotes(prog.notes || "");
      
      if (prog.practiceMarkers) {
        try {
          const parsed = JSON.parse(prog.practiceMarkers);
          if (Array.isArray(parsed)) {
            setMarkers(parsed.sort((a, b) => a - b));
            return;
          }
        } catch (e) {
          console.error("Failed to parse practice markers:", e);
        }
      }
    } else {
      setProgressStatus("learning");
      setProgressSpeed(100);
      setProgressNotes("");
    }
    setMarkers([]);
  }, [song.id, progressMap]);

  // Sync offsets from activeRoleGroup
  useEffect(() => {
    if (activeRoleGroup) {
      setBackingOffset(String(activeRoleGroup.backingStartOffset ?? 0));
      setTabOffset(String(activeRoleGroup.tabStartOffset ?? 0));
    }
  }, [activeRoleGroup]);

  // Set default active video state on track change depending on what's available
  useEffect(() => {
    if (backingVideoId) {
      setActiveVideo("backing");
    } else if (tabVideoId) {
      setActiveVideo("tab");
    }
  }, [backingVideoId, tabVideoId]);

  // 2. Play video initialization
  useEffect(() => {
    if (!apiLoaded) return;

    // Reset references
    if (backingPlayerRef.current) {
      try { backingPlayerRef.current.destroy(); } catch (e) {}
      backingPlayerRef.current = null;
    }
    if (tabPlayerRef.current) {
      try { tabPlayerRef.current.destroy(); } catch (e) {}
      tabPlayerRef.current = null;
    }

    const backingOffsetVal = activeRoleGroup?.backingStartOffset ?? 0;
    const tabOffsetVal = activeRoleGroup?.tabStartOffset ?? 0;

    // Initialize backing track player
    if (backingVideoId) {
      backingPlayerRef.current = new (window as any).YT.Player("backing-player-div", {
        videoId: backingVideoId,
        playerVars: {
          enablejsapi: 1,
          origin: window.location.origin,
          mute: activeVideo === "backing" ? 0 : 1,
        },
        events: {
          onReady: (event: any) => {
            // Play video and seek to start offset
            event.target.playVideo();
            if (backingOffsetVal > 0) {
              event.target.seekTo(backingOffsetVal, true);
            }
          }
        }
      });
    }

    // Initialize tab lesson player
    if (tabVideoId) {
      tabPlayerRef.current = new (window as any).YT.Player("tab-player-div", {
        videoId: tabVideoId,
        playerVars: {
          enablejsapi: 1,
          origin: window.location.origin,
          mute: activeVideo === "tab" ? 0 : 1,
        },
        events: {
          onReady: (event: any) => {
            // Play video and seek to start offset
            event.target.playVideo();
            if (tabOffsetVal > 0) {
              event.target.seekTo(tabOffsetVal, true);
            }
          }
        }
      });
    }

    return () => {
      if (backingPlayerRef.current) {
        try { backingPlayerRef.current.destroy(); } catch (e) {}
        backingPlayerRef.current = null;
      }
      if (tabPlayerRef.current) {
        try { tabPlayerRef.current.destroy(); } catch (e) {}
        tabPlayerRef.current = null;
      }
    };
  }, [apiLoaded, backingVideoId, tabVideoId]);

  // Sync loop checking drift every 500ms
  useEffect(() => {
    let interval: any;
    if (backingPlayerRef.current && tabPlayerRef.current && hasBothVideos) {
      interval = setInterval(() => {
        try {
          const backingPlayer = backingPlayerRef.current;
          const tabPlayer = tabPlayerRef.current;

          if (
            typeof backingPlayer.getPlayerState !== "function" ||
            typeof tabPlayer.getPlayerState !== "function"
          ) {
            return;
          }

          const isBackingPlaying = backingPlayer.getPlayerState() === 1;
          const isTabPlaying = tabPlayer.getPlayerState() === 1;

          if (isBackingPlaying || isTabPlaying) {
            const activePlayer = activeVideo === "backing" ? backingPlayer : tabPlayer;
            const inactivePlayer = activeVideo === "backing" ? tabPlayer : backingPlayer;

            const activeOffset = activeVideo === "backing" ? (activeRoleGroup?.backingStartOffset ?? 0) : (activeRoleGroup?.tabStartOffset ?? 0);
            const inactiveOffset = activeVideo === "backing" ? (activeRoleGroup?.tabStartOffset ?? 0) : (activeRoleGroup?.backingStartOffset ?? 0);

            const activeTime = activePlayer.getCurrentTime();
            const inactiveTime = inactivePlayer.getCurrentTime();

            const expectedInactiveTime = activeTime - activeOffset + inactiveOffset;

            // If background video drifts by more than 150ms from expected synchronization time, realign it!
            if (Math.abs(inactiveTime - expectedInactiveTime) > 0.15 && expectedInactiveTime >= 0) {
              inactivePlayer.seekTo(expectedInactiveTime, true);
            }
          }
        } catch (e) {
          // ignore loading errors before players ready
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [activeVideo, hasBothVideos, activeRoleGroup]);

  // Synchronized video toggle action
  const handleToggleVideo = () => {
    if (!hasBothVideos) return;
    
    const nextVideo = activeVideo === "backing" ? "tab" : "backing";
    
    const activePlayer = activeVideo === "backing" ? backingPlayerRef.current : tabPlayerRef.current;
    const inactivePlayer = activeVideo === "backing" ? tabPlayerRef.current : backingPlayerRef.current;

    const activeOffset = activeVideo === "backing" ? (activeRoleGroup?.backingStartOffset ?? 0) : (activeRoleGroup?.tabStartOffset ?? 0);
    const inactiveOffset = activeVideo === "backing" ? (activeRoleGroup?.tabStartOffset ?? 0) : (activeRoleGroup?.backingStartOffset ?? 0);

    if (activePlayer && inactivePlayer) {
      try {
        const currentTime = activePlayer.getCurrentTime();
        const state = activePlayer.getPlayerState(); // 1 = playing, 2 = paused

        const targetTime = Math.max(0, currentTime - activeOffset + inactiveOffset);
        inactivePlayer.seekTo(targetTime, true);
        
        if (state === 1) {
          inactivePlayer.playVideo();
        } else if (state === 2) {
          inactivePlayer.pauseVideo();
        }

        // Mute / Unmute
        activePlayer.mute();
        inactivePlayer.unMute();
      } catch (e) {
        console.error("Error switching player timeline:", e);
      }
    }

    setActiveVideo(nextVideo);
  };

  // User keyboard listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Intercept TAB key
      if (e.key === "Tab") {
        e.preventDefault();
        handleToggleVideo();
        return;
      }

      // Skip inputs and textareas for number keys
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Keys 1-9
      if (e.key >= "1" && e.key <= "9") {
        const index = parseInt(e.key) - 1;
        if (index < markers.length) {
          const targetTime = markers[index];
          const activePlayer = activeVideo === "backing" ? backingPlayerRef.current : tabPlayerRef.current;
          if (activePlayer) {
            try {
              activePlayer.seekTo(targetTime, true);
            } catch (err) {
              console.error("Error seeking via hotkey:", err);
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [markers, activeVideo, hasBothVideos, activeRoleGroup]);

  // Practice Markers Saving/Deleting
  const handleSaveMarker = async (newTime: number) => {
    // Unique list, sorted ascending
    const updated = Array.from(new Set([...markers, newTime])).sort((a, b) => a - b);
    setMarkers(updated);
    try {
      await savePracticeMarkers(song.id, updated);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMarker = async (indexToDelete: number) => {
    const updated = markers.filter((_, idx) => idx !== indexToDelete);
    setMarkers(updated);
    try {
      await savePracticeMarkers(song.id, updated);
      onRefresh();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveCurrentTimeAsMarker = () => {
    const activePlayer = activeVideo === "backing" ? backingPlayerRef.current : tabPlayerRef.current;
    if (activePlayer) {
      try {
        const time = activePlayer.getCurrentTime();
        if (typeof time === "number" && !isNaN(time)) {
          const rounded = Math.round(time * 1000) / 1000;
          handleSaveMarker(rounded);
        }
      } catch (err) {
        console.error("Failed to get time:", err);
      }
    }
  };

  // Global Sync Offsets Saving
  const handleSaveOffsets = async () => {
    if (!activeRoleGroup) return;
    setIsSavingOffsets(true);
    try {
      const bOffset = parseFloat(backingOffset) || 0;
      const tOffset = parseFloat(tabOffset) || 0;
      const res = await updateRoleGroupStartOffsets(activeRoleGroup.id, bOffset, tOffset);
      if (res.success) {
        onRefresh();
      } else {
        alert("Failed to save offsets: " + res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingOffsets(false);
    }
  };

  const handleSaveProgress = async () => {
    setIsSavingProgress(true);
    try {
      const res = await saveSongProgress(song.id, progressStatus, progressSpeed, progressNotes);
      if (res.success) {
        onRefresh();
      } else {
        alert("Failed to save progress: " + res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingProgress(false);
    }
  };

  const handleInstrumentChange = async (role: string) => {
    const matching = standardRoleGroups.find((rg) => rg.role === role);
    if (matching) {
      setActiveTrackId(matching.id);
      localStorage.setItem("bandboard_instrument", role);
      await saveUserSettings(role);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0c0d0e] text-[#f1f2f4] p-4 md:p-6 pb-24">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#27282b] pb-4 mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={onExit}
            className="text-[#888d96] hover:text-[#f1f2f4] rounded-xl border border-[#27282b] bg-[#161719]/40 h-10 px-3 flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit Practice Mode
          </Button>
          <div className="hidden sm:block">
            <span className="text-[10px] font-extrabold text-[#acd1f8] uppercase tracking-wider bg-[#2e4057]/40 border border-[#446285]/50 px-2.5 py-1 rounded-full">
              PRACTICE MODE
            </span>
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-base font-bold text-[#f1f2f4] truncate max-w-[200px] sm:max-w-xs">{song.title}</h1>
          <p className="text-xs text-[#888d96] truncate">{song.artist}</p>
        </div>
      </header>

      {/* Main Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Left Side: Large Player Panel (8 columns) */}
        <div className="lg:col-span-8 flex flex-col space-y-4">
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-[#27282b] bg-black shadow-2xl flex flex-col items-center justify-center">
            {/* Backing Track Player Frame Wrapper */}
            {backingVideoId && (
              <div 
                key={`backing-container-${backingVideoId}`}
                className="w-full h-full transition-opacity duration-200"
                style={activeVideo === "backing" ? {
                  opacity: 1,
                  pointerEvents: "auto",
                } : {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  opacity: 0,
                  pointerEvents: "none",
                  zIndex: -10,
                }}
              >
                <div id="backing-player-div" className="w-full h-full" />
              </div>
            )}

            {/* Tab Video Player Frame Wrapper */}
            {tabVideoId && (
              <div 
                key={`tab-container-${tabVideoId}`}
                className="w-full h-full transition-opacity duration-200"
                style={activeVideo === "tab" ? {
                  opacity: 1,
                  pointerEvents: "auto",
                } : {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  opacity: 0,
                  pointerEvents: "none",
                  zIndex: -10,
                }}
              >
                <div id="tab-player-div" className="w-full h-full" />
              </div>
            )}

            {/* Loading/Error Indicators */}
            {activeVideo === "backing" && !backingVideoId && (
              <div className="text-center p-6 text-[#888d96]">
                <Music className="w-12 h-12 mx-auto mb-2 text-[#27282b] animate-pulse" />
                <p className="text-sm font-semibold text-[#f1f2f4]">No backing track configured for this instrument.</p>
              </div>
            )}

            {activeVideo === "tab" && !tabVideoId && (
              <div className="text-center p-6 text-[#888d96]">
                <Video className="w-12 h-12 mx-auto mb-2 text-[#27282b] animate-pulse" />
                <p className="text-sm font-semibold text-[#f1f2f4]">No tab/lesson video configured for this instrument.</p>
              </div>
            )}

            {!apiLoaded && (
              <div className="absolute inset-0 bg-[#0c0d0e]/95 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#5b80a5] mb-2" />
                <p className="text-xs text-[#888d96]">Loading YouTube Player API...</p>
              </div>
            )}
          </div>

          {/* Unified Practice Controls & Video Sync Settings */}
          <Card className="border-[#27282b] bg-[#161719]/40 rounded-2xl shadow-lg overflow-hidden">
            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-[#27282b]">
                {/* Col 1: Switcher Controls */}
                <div className="space-y-3 pb-4 md:pb-0 md:pr-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-[#888d96] uppercase tracking-wider block">
                      Feed Selector
                    </span>
                    <Badge className="bg-[#1b2330] border border-[#2e4057] text-[#acd1f8] text-[9px] px-2 py-0.5 uppercase">
                      Sync Enabled
                    </Badge>
                  </div>
                  
                  {hasBothVideos ? (
                    <div className="flex bg-[#0c0d0e]/60 p-1 border border-[#27282b] rounded-xl gap-1 w-full justify-between">
                      <Button
                        onClick={() => { if (activeVideo !== "backing") handleToggleVideo(); }}
                        className={cn(
                          "text-xs font-bold px-3 py-1.5 h-8 rounded-lg transition-all border-0 flex-1 cursor-pointer",
                          activeVideo === "backing"
                            ? "bg-[#2e4057] text-[#acd1f8] hover:bg-[#2e4057] hover:text-[#acd1f8]"
                            : "bg-transparent text-[#888d96] hover:text-[#f1f2f4] hover:bg-[#161719]/40"
                        )}
                      >
                        Instrumental
                      </Button>
                      <Button
                        onClick={() => { if (activeVideo !== "tab") handleToggleVideo(); }}
                        className={cn(
                          "text-xs font-bold px-3 py-1.5 h-8 rounded-lg transition-all border-0 flex-1 cursor-pointer",
                          activeVideo === "tab"
                            ? "bg-[#2e4057] text-[#acd1f8] hover:bg-[#2e4057] hover:text-[#acd1f8]"
                            : "bg-transparent text-[#888d96] hover:text-[#f1f2f4] hover:bg-[#161719]/40"
                        )}
                      >
                        Vocal reference
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#888d96]">Dual feeds not configured for this instrument.</p>
                  )}
                  
                  <p className="text-[10px] text-[#888d96] italic leading-normal">
                    Tip: Press <kbd className="bg-[#0c0d0e] px-1.5 py-0.5 rounded border border-[#27282b] font-mono text-[9px] text-[#acd1f8]">TAB</kbd> on your keyboard to toggle feeds instantly.
                  </p>
                </div>

                {/* Col 2: Practice Markers (Private) */}
                <div className="space-y-3 pt-4 md:pt-0 md:px-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-[#888d96] uppercase tracking-wider flex items-center gap-1">
                      <Bookmark className="w-3.5 h-3.5 text-[#acd1f8]" />
                      Practice Markers
                    </span>
                    <span className="text-[9px] text-[#888d96] font-medium">Private</span>
                  </div>

                  <Button
                    onClick={handleSaveCurrentTimeAsMarker}
                    className="w-full bg-[#1b2330] hover:bg-[#202b3c] border border-[#2e4057] text-[#acd1f8] text-[11px] font-bold py-1.5 h-8 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Bookmark className="w-3 h-3 fill-current" />
                    Save Current Time
                  </Button>

                  <div className="space-y-1.5">
                    {markers.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-h-[110px] overflow-y-auto pr-1 scrollbar-thin">
                        {markers.map((time, idx) => {
                          const displayLabel = `${idx + 1}: ${time.toFixed(1)}s`;
                          return (
                            <div key={idx} className="flex items-center bg-[#0c0d0e]/60 border border-[#27282b] rounded-lg overflow-hidden h-7">
                              <button
                                onClick={() => {
                                  const activePlayer = activeVideo === "backing" ? backingPlayerRef.current : tabPlayerRef.current;
                                  if (activePlayer) activePlayer.seekTo(time, true);
                                }}
                                className="text-[10px] font-bold text-[#acd1f8] hover:text-[#f1f2f4] px-2 h-full hover:bg-[#2e4057]/30 transition-all cursor-pointer border-0 flex items-center"
                                title={`Jump to marker ${idx + 1}`}
                              >
                                {displayLabel}
                              </button>
                              <button
                                onClick={() => handleDeleteMarker(idx)}
                                className="text-[#888d96] hover:text-red-400 px-1.5 h-full hover:bg-red-950/20 border-l border-[#27282b] transition-all cursor-pointer flex items-center"
                                title="Delete marker"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-[#888d96] leading-normal italic text-center py-2">
                        No markers saved. Save moments and press 1-9 to jump.
                      </p>
                    )}
                  </div>
                </div>

                {/* Col 3: Global Offsets (Shared) */}
                <div className="space-y-3 pt-4 md:pt-0 md:pl-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-[#888d96] uppercase tracking-wider flex items-center gap-1">
                      <Settings className="w-3.5 h-3.5 text-[#acd1f8]" />
                      Global Start Sync
                    </span>
                    <span className="text-[9px] text-[#acd1f8] font-bold uppercase tracking-wider bg-[#1b2330] border border-[#2e4057] px-1 rounded">Band</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-[#888d96] uppercase tracking-wider block">Instrumental (s)</label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={backingOffset}
                        onChange={(e) => setBackingOffset(e.target.value)}
                        className="bg-[#0c0d0e]/60 border border-[#27282b] text-[11px] rounded-lg text-[#f1f2f4] h-7 px-2"
                        placeholder="0.0"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-[#888d96] uppercase tracking-wider block">Vocal ref (s)</label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={tabOffset}
                        onChange={(e) => setTabOffset(e.target.value)}
                        className="bg-[#0c0d0e]/60 border border-[#27282b] text-[11px] rounded-lg text-[#f1f2f4] h-7 px-2"
                        placeholder="0.0"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleSaveOffsets}
                    disabled={isSavingOffsets || !activeRoleGroup}
                    className="w-full bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] text-[11px] font-bold py-1.5 h-8 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {isSavingOffsets ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-3 h-3 text-[#5b80a5]" />
                        Save Sync Offsets
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Side: Log & Settings Panel (4 columns) */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          {/* Instrument Settings */}
          <Card className="border-[#27282b] bg-[#161719]/40 rounded-2xl shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-[#f1f2f4] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#888d96]" />
                Select Instrument Tab
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {standardRoleGroups.map((rg) => {
                  const isSelected = activeTrackId === rg.id;
                  return (
                    <Button
                      key={rg.id}
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => handleInstrumentChange(rg.role)}
                      className={cn(
                        "rounded-xl text-xs font-bold h-10 px-2",
                        isSelected
                          ? "bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4]"
                          : "border-[#27282b] bg-[#0c0d0e]/40 text-[#888d96] hover:bg-[#27282b] hover:text-[#f1f2f4]"
                      )}
                    >
                      {rg.role}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Notation Links */}
          {activeRoleGroup && activeRoleGroup.tracks.length > 0 && (
            <Card className="border-[#27282b] bg-[#161719]/40 rounded-2xl shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-[#f1f2f4] flex items-center gap-2">
                  <Music className="w-4 h-4 text-[#888d96]" />
                  Notation Links ({activeRoleGroup.role})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeRoleGroup.tracks.map((track) => {
                  const hasSongsterr = track.tabLink && track.tabLink.includes("-tab-s");
                  const links = {
                    tab: track.tabLink,
                    sheet: hasSongsterr ? track.tabLink.replace("-tab-s", "-sheet-s") : track.tabLink,
                    chords: hasSongsterr ? track.tabLink.replace(/-tab-s(\d+)(t\d+)?/, "-chords-s$1") : track.tabLink,
                  };

                  return (
                    <div key={track.id} className="space-y-2 border-b border-[#27282b]/60 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#d1d1d6]">{track.instrumentName}</span>
                        {track.tuning && (
                          <Badge className="bg-[#0c0d0e]/60 border border-[#27282b] text-[9px] font-mono text-[#888d96]">
                            {track.tuning}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-2 pt-1">
                        <a
                          href={links.tab}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            buttonVariants({ variant: "default", size: "sm" }),
                            "bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl flex items-center gap-1.5 text-[11px] font-bold py-1.5 px-3 transition-all cursor-pointer"
                          )}
                        >
                          Interactive Tab
                          <ExternalLink className="w-3 h-3 text-[#888d96]" />
                        </a>

                        {hasSongsterr && (
                          <>
                            <a
                              href={links.sheet}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                buttonVariants({ variant: "default", size: "sm" }),
                                "bg-[#1b2330] hover:bg-[#202b3c] border border-[#2e4057] text-[#f1f2f4] rounded-xl flex items-center gap-1.5 text-[11px] font-bold py-1.5 px-3 transition-all cursor-pointer"
                              )}
                            >
                              Sheets
                              <ExternalLink className="w-3 h-3 text-[#888d96]" />
                            </a>
                            <a
                              href={links.chords}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                buttonVariants({ variant: "default", size: "sm" }),
                                "bg-[#1b2824] hover:bg-[#22352f] border border-[#2d473f] text-[#f1f2f4] rounded-xl flex items-center gap-1.5 text-[11px] font-bold py-1.5 px-3 transition-all cursor-pointer"
                              )}
                            >
                              Chords
                              <ExternalLink className="w-3 h-3 text-[#888d96]" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Rehearsal Log */}
          <Card className="border-[#27282b] bg-[#161719]/40 rounded-2xl shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-[#f1f2f4] flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#888d96]" />
                Practice Log
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Learning Status */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-[#888d96] uppercase tracking-wider block">Learning Status</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {["not_started", "learning", "mastered"].map((status) => {
                    const isSelected = progressStatus === status;
                    const label = status === "not_started" ? "Not Started" : status === "learning" ? "Learning" : "Mastered";
                    return (
                      <Button
                        key={status}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => setProgressStatus(status)}
                        className={cn(
                          "rounded-lg text-[10px] font-bold h-8 px-2 transition-all",
                          isSelected
                            ? status === "mastered"
                              ? "bg-emerald-950/40 border border-emerald-800 text-emerald-400 hover:bg-emerald-950/50"
                              : status === "learning"
                              ? "bg-sky-950/40 border border-sky-800 text-sky-400 hover:bg-sky-950/50"
                              : "bg-zinc-800/40 border border-zinc-700 text-zinc-300 hover:bg-zinc-800/50"
                            : "border-[#27282b] bg-[#0c0d0e]/20 text-[#888d96] hover:bg-[#27282b]/50 hover:text-[#f1f2f4]"
                        )}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Speed Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[11px] font-bold text-[#888d96] uppercase tracking-wider">Practice Speed</label>
                  <span className="text-xs font-mono font-bold text-[#5b80a5]">{progressSpeed}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="150"
                  step="5"
                  value={progressSpeed}
                  onChange={(e) => setProgressSpeed(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-[#161719] border border-[#27282b] rounded-lg appearance-none cursor-pointer accent-[#5b80a5]"
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-[#888d96] uppercase tracking-wider block">Notes</label>
                <textarea
                  placeholder="Record highlights, difficult parts, or speed settings..."
                  value={progressNotes}
                  onChange={(e) => setProgressNotes(e.target.value)}
                  className="w-full bg-[#0c0d0e] border border-[#27282b] rounded-xl text-xs text-[#f1f2f4] p-3 focus:outline-none focus:border-[#5b80a5] focus:ring-1 focus:ring-[#5b80a5] resize-none h-24 placeholder:text-[#4e525a]"
                />
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSaveProgress}
                disabled={isSavingProgress}
                className="w-full bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl text-xs font-bold py-2 h-10 flex items-center justify-center gap-1.5"
              >
                {isSavingProgress ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Practice Log"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
