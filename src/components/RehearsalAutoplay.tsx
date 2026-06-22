"use client";

import { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  X,
  RotateCcw,
  CheckCircle2,
  Music,
  Calendar,
  Clock,
  Volume2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSongTunings } from "@/lib/tunings";

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
  tracks: Track[];
}

interface Song {
  id: string;
  title: string;
  artist: string;
  songsterrId: number | null;
  albumArt?: string | null;
  createdAt: number;
  roleGroups: RoleGroup[];
}

interface RehearsalSong {
  rehearsalId: string;
  songId: string;
  sortOrder: number;
  song: Song;
}

interface RehearsalDetails {
  id: string;
  title: string;
  date: number;
  notes: string | null;
  rehearsalSongs: RehearsalSong[];
}

interface RehearsalAutoplayProps {
  rehearsal: RehearsalDetails;
  onExit: () => void;
  preferredInstrument?: string;
  progressMap: Record<string, { status: string; speed: number; notes: string | null; backingStartOffset?: number | null }>;
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

// Helper to extract backing track video ID
function getBackingVideoId(song: Song, preferredRole?: string): string | null {
  const standardRoleGroups = song.roleGroups.filter((rg) => rg.role !== "Other");

  // 1. Try matching preferred role backing track
  if (preferredRole) {
    const matchingRg = standardRoleGroups.find(
      (rg) => rg.role.toLowerCase() === preferredRole.toLowerCase()
    );
    if (matchingRg?.backingTrackLink) {
      const vidId = getYouTubeId(matchingRg.backingTrackLink);
      if (vidId) return vidId;
    }
  }

  // 2. Try any backing track link
  for (const rg of standardRoleGroups) {
    if (rg.backingTrackLink) {
      const vidId = getYouTubeId(rg.backingTrackLink);
      if (vidId) return vidId;
    }
  }

  // 3. Fallback to tab video link of preferred role
  if (preferredRole) {
    const matchingRg = standardRoleGroups.find(
      (rg) => rg.role.toLowerCase() === preferredRole.toLowerCase()
    );
    if (matchingRg?.tabVideoLink) {
      const vidId = getYouTubeId(matchingRg.tabVideoLink);
      if (vidId) return vidId;
    }
  }

  // 4. Try any tab video link
  for (const rg of standardRoleGroups) {
    if (rg.tabVideoLink) {
      const vidId = getYouTubeId(rg.tabVideoLink);
      if (vidId) return vidId;
    }
  }

  return null;
}

export function RehearsalAutoplay({
  rehearsal,
  onExit,
  preferredInstrument,
  progressMap
}: RehearsalAutoplayProps) {
  const apiLoaded = useYoutubeApi();
  const playerRef = useRef<any>(null);

  // Rehearsal songs queue, sorted by sortOrder
  const queue = [...rehearsal.rehearsalSongs].sort((a, b) => a.sortOrder - b.sortOrder);

  // States
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  // Countdown States
  const [countdown, setCountdown] = useState(5);
  const [isCountdownActive, setIsCountdownActive] = useState(false);
  const [isCountdownPaused, setIsCountdownPaused] = useState(false);

  const currentSong = queue[currentSongIndex]?.song;
  const currentVideoId = currentSong ? getBackingVideoId(currentSong, preferredInstrument) : null;

  // Active track information
  const activeRoleGroup = currentSong?.roleGroups.find(
    (rg) => rg.role.toLowerCase() === (preferredInstrument || "").toLowerCase()
  ) || currentSong?.roleGroups[0];

  // Auto-skip countdown handler
  useEffect(() => {
    if (!isCountdownActive || isCountdownPaused) return;

    if (countdown <= 0) {
      setIsCountdownActive(false);
      const nextIndex = currentSongIndex + 1;
      if (nextIndex < queue.length) {
        setCurrentSongIndex(nextIndex);
      }
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isCountdownActive, countdown, isCountdownPaused, currentSongIndex, queue.length]);

  // Handle video when currentSongIndex changes
  useEffect(() => {
    if (!apiLoaded || !currentSong) return;

    // Reset countdown states
    setIsCountdownActive(false);
    setIsCountdownPaused(false);
    setCountdown(5);

    const offsetVal = progressMap[currentSong.id]?.backingStartOffset ?? 0;

    if (currentVideoId) {
      // Re-create or load video
      if (playerRef.current && typeof playerRef.current.loadVideoById === "function") {
        try {
          playerRef.current.loadVideoById({
            videoId: currentVideoId,
            startSeconds: offsetVal
          });
          setIsPlaying(true);
        } catch (e) {
          console.error("Error loading video by ID:", e);
          initPlayer(currentVideoId, offsetVal);
        }
      } else {
        initPlayer(currentVideoId, offsetVal);
      }
    } else {
      // No video found for the song: wait 4 seconds, then show countdown to skip
      setIsPlaying(false);
      if (playerRef.current) {
        try {
          playerRef.current.pauseVideo();
        } catch (e) {}
      }

      const warningTimer = setTimeout(() => {
        handleSongEnded();
      }, 4000);

      return () => clearTimeout(warningTimer);
    }
  }, [currentSongIndex, apiLoaded, currentVideoId]);

  // Destroy player on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {}
      }
    };
  }, []);

  const initPlayer = (videoId: string, startOffset: number) => {
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch (e) {}
    }

    try {
      playerRef.current = new (window as any).YT.Player("autoplay-player-div", {
        videoId: videoId,
        playerVars: {
          enablejsapi: 1,
          origin: typeof window !== "undefined" ? window.location.origin : "",
          autoplay: 1,
          controls: 1,
          rel: 0,
        },
        events: {
          onReady: (event: any) => {
            event.target.playVideo();
            setIsPlaying(true);
            if (startOffset > 0) {
              event.target.seekTo(startOffset, true);
            }
          },
          onStateChange: (event: any) => {
            const state = event.data;
            if (state === (window as any).YT.PlayerState.ENDED) {
              handleSongEnded();
            } else if (state === (window as any).YT.PlayerState.PLAYING) {
              setIsPlaying(true);
            } else if (state === (window as any).YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            }
          }
        }
      });
    } catch (err) {
      console.error("Failed to initialize YT Player:", err);
    }
  };

  const handleSongEnded = () => {
    if (currentSongIndex >= queue.length - 1) {
      setIsFinished(true);
      setIsPlaying(false);
    } else {
      setCountdown(5);
      setIsCountdownActive(true);
      setIsCountdownPaused(false);
    }
  };

  const handleTogglePlay = () => {
    if (!playerRef.current) return;
    try {
      if (isPlaying) {
        playerRef.current.pauseVideo();
        setIsPlaying(false);
      } else {
        playerRef.current.playVideo();
        setIsPlaying(true);
      }
    } catch (e) {}
  };

  const handlePrevSong = () => {
    if (currentSongIndex > 0) {
      setCurrentSongIndex((prev) => prev - 1);
    }
  };

  const handleNextSong = () => {
    if (currentSongIndex < queue.length - 1) {
      setCurrentSongIndex((prev) => prev + 1);
    }
  };

  const handleSkipCountdown = () => {
    setIsCountdownActive(false);
    const nextIndex = currentSongIndex + 1;
    if (nextIndex < queue.length) {
      setCurrentSongIndex(nextIndex);
    }
  };

  const handleRestartRehearsal = () => {
    setCurrentSongIndex(0);
    setIsFinished(false);
    setIsCountdownActive(false);
    setIsPlaying(false);
  };

  // Circular progress countdown SVG calculations
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (countdown / 5) * circumference;

  const nextSong = queue[currentSongIndex + 1]?.song;

  return (
    <div className="fixed inset-0 z-50 bg-[#0c0d0e] text-[#f1f2f4] flex flex-col h-screen overflow-hidden">
      {/* Autoplay Header */}
      <header className="border-b border-[#27282b] bg-[#161719]/40 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onExit}
            className="text-[#888d96] hover:text-[#f1f2f4] hover:bg-[#27282b] rounded-xl h-10 w-10 flex-shrink-0"
            title="Exit Autoplay"
          >
            <X className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-[#f1f2f4] uppercase tracking-wide truncate">
              {rehearsal.title}
            </h2>
            <div className="flex items-center gap-2 text-[10px] text-[#888d96] mt-0.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date(rehearsal.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="text-[#27282b]">•</span>
              <Volume2 className="w-3.5 h-3.5" />
              <span>Autoplay Mode ({preferredInstrument || "Standard"})</span>
            </div>
          </div>
        </div>

        {/* Exit Badge */}
        <Badge className="bg-[#2e4057]/40 text-[#acd1f8] border border-[#446285]/30 text-[10px] font-extrabold uppercase py-1 px-2.5 rounded-lg flex items-center gap-1.5 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-[#acd1f8] animate-ping shrink-0" />
          Autoplay Active
        </Badge>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left Column: Player (70%) */}
        <div className="flex-1 lg:flex-[7] p-4 lg:p-6 flex flex-col justify-center min-h-0 overflow-y-auto lg:overflow-hidden bg-[#0c0d0e]/60">
          <div className="w-full max-w-4xl mx-auto flex flex-col gap-4 h-full justify-center">
            {/* Player aspect wrapper */}
            <div className="w-full aspect-video bg-black border border-[#27282b] rounded-2xl overflow-hidden relative shadow-2xl shadow-black/90 flex-shrink-0">
              {/* YouTube Iframe element */}
              <div
                id="autoplay-player-div"
                className={cn("w-full h-full aspect-video", !currentVideoId ? "hidden" : "")}
              />

              {/* HUD: Countdown overlay */}
              {isCountdownActive && nextSong && (
                <div className="absolute inset-0 z-30 bg-[#0c0d0e]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                  <div className="space-y-4 max-w-sm flex flex-col items-center">
                    <p className="text-[10px] font-bold text-[#888d96] uppercase tracking-widest">
                      Up Next In
                    </p>

                    {/* Circular Countdown Progress */}
                    <div className="relative w-24 h-24 flex items-center justify-center">
                      <svg className="w-24 h-24 transform -rotate-90">
                        <circle
                          cx="48"
                          cy="48"
                          r={radius}
                          className="stroke-[#1d1e21]"
                          strokeWidth="5"
                          fill="transparent"
                        />
                        <circle
                          cx="48"
                          cy="48"
                          r={radius}
                          className="stroke-[#acd1f8] transition-all duration-1000 ease-linear"
                          strokeWidth="5"
                          fill="transparent"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                        />
                      </svg>
                      <span className="absolute text-2xl font-black text-[#acd1f8]">
                        {countdown}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <h3 className="text-base font-black text-[#f1f2f4] leading-snug line-clamp-1">
                        {nextSong.title}
                      </h3>
                      <p className="text-xs text-[#888d96] line-clamp-1">
                        by {nextSong.artist}
                      </p>
                    </div>

                    {/* Control HUD Buttons */}
                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        size="sm"
                        onClick={() => setIsCountdownPaused(!isCountdownPaused)}
                        className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl text-xs font-bold px-4 h-9"
                      >
                        {isCountdownPaused ? "Resume Autoplay" : "Pause Timer"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSkipCountdown}
                        className="bg-[#acd1f8] hover:bg-[#bce0ff] text-[#0c0d0e] rounded-xl text-xs font-black px-4 h-9"
                      >
                        Play Now
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* HUD: Warning overlay when no video exists */}
              {!currentVideoId && !isCountdownActive && !isFinished && currentSong && (
                <div className="absolute inset-0 z-20 bg-[#0c0d0e]/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                  <div className="space-y-3 max-w-md flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-[#3b1c1c] border border-red-900/60 flex items-center justify-center text-red-400 mb-2">
                      <Music className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-red-400">No Backing Track Found</h3>
                    <p className="text-xs text-[#888d96] max-w-xs leading-relaxed">
                      Could not find a valid backing track or video link for <span className="font-bold text-[#f1f2f4]">"{currentSong.title}"</span>. Skipping in a few seconds...
                    </p>
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={handleNextSong}
                        className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-xs font-bold rounded-xl h-8 px-3"
                      >
                        Skip Song
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* HUD: Rehearsal Session Finished */}
              {isFinished && (
                <div className="absolute inset-0 z-30 bg-[#0c0d0e]/98 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                  <div className="space-y-4 max-w-sm flex flex-col items-center">
                    <div className="w-14 h-14 rounded-full bg-[#1b3b2b] border border-emerald-900/60 flex items-center justify-center text-emerald-400 mb-2">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-lg font-black text-[#f1f2f4]">Rehearsal Prep Complete!</h3>
                      <p className="text-xs text-[#888d96] leading-relaxed">
                        You played through all the backing tracks in your setlist sequence.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 pt-3">
                      <Button
                        onClick={handleRestartRehearsal}
                        className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl text-xs font-bold px-4 h-10"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restart Setlist
                      </Button>
                      <Button
                        onClick={onExit}
                        className="bg-[#acd1f8] hover:bg-[#bce0ff] text-[#0c0d0e] rounded-xl text-xs font-black px-4 h-10"
                      >
                        Back to Session
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Video Player Information Footer */}
            {currentSong && (
              <div className="bg-[#161719]/40 border border-[#27282b] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0 shadow-lg">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-[#888d96] uppercase tracking-widest block">
                    Now Playing (Song {currentSongIndex + 1} of {queue.length})
                  </span>
                  <h3 className="text-lg font-black text-[#f1f2f4] mt-1 truncate">
                    {currentSong.title}
                  </h3>
                  <p className="text-xs text-[#888d96] truncate mt-0.5">
                    by {currentSong.artist}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {/* Tuning badges */}
                  {(() => {
                    const songTunings = getSongTunings(currentSong);
                    if (songTunings.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-1">
                        {songTunings.map((ind) => (
                          <Badge
                            key={`${ind.role}-${ind.tuning}`}
                            className={cn(
                              "text-[8px] font-mono tracking-wide px-1.5 py-0.5 border shrink-0",
                              preferredInstrument && ind.role.toLowerCase() === preferredInstrument.toLowerCase()
                                ? "bg-[#2e4057]/45 border-[#446285]/55 text-[#acd1f8]"
                                : "bg-[#161719]/40 border-[#27282b] text-[#6c727a]"
                            )}
                          >
                            {ind.tuning}
                          </Badge>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Player Queue Control Buttons */}
                  <div className="flex items-center gap-1.5 border-l border-[#27282b] pl-3.5">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={currentSongIndex === 0}
                      onClick={handlePrevSong}
                      className="h-9 w-9 border-[#27282b] bg-[#0c0d0e]/40 hover:bg-[#27282b] text-[#888d96] hover:text-[#f1f2f4] rounded-lg disabled:opacity-30 flex items-center justify-center"
                      title="Previous Song"
                    >
                      <SkipBack className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleTogglePlay}
                      disabled={!currentVideoId}
                      className="h-9 w-9 border-[#27282b] bg-[#0c0d0e]/40 hover:bg-[#27282b] text-[#acd1f8] hover:text-white rounded-lg flex items-center justify-center"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={currentSongIndex === queue.length - 1}
                      onClick={handleNextSong}
                      className="h-9 w-9 border-[#27282b] bg-[#0c0d0e]/40 hover:bg-[#27282b] text-[#888d96] hover:text-[#f1f2f4] rounded-lg disabled:opacity-30 flex items-center justify-center"
                      title="Next Song"
                    >
                      <SkipForward className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Queue Sidebar (30%) */}
        <div className="w-full lg:w-80 lg:border-l border-[#27282b] bg-[#161719]/10 flex flex-col overflow-hidden flex-shrink-0 min-h-0">
          <div className="p-4 border-b border-[#27282b] flex-shrink-0 flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#f1f2f4] uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#888d96]" />
              Setlist Queue
            </h3>
            <span className="text-[10px] font-bold text-[#888d96] bg-[#0c0d0e] border border-[#27282b] px-2 py-0.5 rounded-md">
              {queue.length} songs
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
            {queue.map((rs, index) => {
              const song = rs.song;
              const isSongActive = index === currentSongIndex;
              const isSongCompleted = index < currentSongIndex;
              const isSongNext = index === currentSongIndex + 1;

              return (
                <div
                  key={rs.songId}
                  onClick={() => setCurrentSongIndex(index)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-all duration-200 cursor-pointer select-none",
                    isSongActive
                      ? "bg-[#27282b] border-[#5b80a5]/45 shadow-md shadow-[#0c0d0e]/40"
                      : isSongCompleted
                      ? "bg-[#0c0d0e]/20 border-[#27282b]/60 opacity-60 hover:opacity-90 hover:border-[#383a3f]"
                      : "bg-[#0c0d0e]/40 border-[#27282b]/80 hover:bg-[#161719]/40 hover:border-[#383a3f]"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 pr-2">
                    <span className="text-xs font-mono font-bold text-[#888d96] w-5 text-right flex-shrink-0">
                      {index + 1}.
                    </span>

                    {/* Album Art or placeholder */}
                    {song.albumArt ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={song.albumArt}
                        alt=""
                        className="w-8 h-8 rounded-lg object-cover border border-[#27282b] flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-[#161719] border border-[#27282b]/60 flex items-center justify-center flex-shrink-0">
                        <Music className="w-3.5 h-3.5 text-[#888d96]" />
                      </div>
                    )}

                    <div className="min-w-0 flex-grow">
                      <h4 className={cn("text-xs font-bold truncate", isSongActive ? "text-[#f1f2f4]" : "text-[#d1d1d6]")}>
                        {song.title}
                      </h4>
                      <p className="text-[10px] text-[#888d96] truncate mt-0.5">
                        {song.artist}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center flex-shrink-0">
                    {isSongCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : isSongActive ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#acd1f8] animate-pulse shadow-[0_0_8px_#acd1f8]" />
                    ) : isSongNext ? (
                      <Clock className="w-4 h-4 text-[#888d96]" />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
