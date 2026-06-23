"use client";

import { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  CheckCircle2,
  Music,
  Calendar,
  Clock,
  ArrowLeft,
  Volume2,
  VolumeX,
  Gauge
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { getSongTunings } from "@/lib/tunings";
import { PrivateIndicator } from "./PrivateIndicator";
import { toast } from "sonner";
import { getUserSettings, saveUserSettings } from "@/app/actions/user";

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
  progressMap: Record<string, { status: string; speed: number; notes: string | null; backingStartOffset?: number | null; tabStartOffset?: number | null; practiceMarkers?: string | null }>;
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
  const isMouseOverPlayerRef = useRef(false);
  const seekTargetRef = useRef<number | null>(null);
  const lastSeekTimeRef = useRef<number>(0);

  // Rehearsal songs queue, sorted by sortOrder
  const queue = [...rehearsal.rehearsalSongs].sort((a, b) => a.sortOrder - b.sortOrder);

  // States
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const [volume, setVolume] = useState<number>(100);
  const [speed, setSpeed] = useState<number>(1.0);

  // Sync volume change to player
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.setVolume === "function") {
      try { playerRef.current.setVolume(volume); } catch (e) {}
    }
  }, [volume]);

  // Sync speed change to player
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.setPlaybackRate === "function") {
      try { playerRef.current.setPlaybackRate(speed); } catch (e) {}
    }
  }, [speed]);



  // Autoplay Configurations
  const [autoplayEnabled, setAutoplayEnabled] = useState<boolean>(true);
  const [transitionTimeout, setTransitionTimeout] = useState<number>(5);

  // Countdown States
  const [countdown, setCountdown] = useState(5);
  const [isCountdownActive, setIsCountdownActive] = useState(true); // Count in on first load
  const [isCountdownPaused, setIsCountdownPaused] = useState(false);
  const [hasStartedSession, setHasStartedSession] = useState(false);

  const [instrumentPreference, setInstrumentPreference] = useState<string>(preferredInstrument || "Guitar");

  // Load autoplay configurations from database or fallback to legacy localStorage
  useEffect(() => {
    async function loadSettings() {
      try {
        const dbSettings = await getUserSettings();
        let enabled = true;
        let timeout = 5;

        if (dbSettings && dbSettings.autoplayTimeout !== undefined) {
          enabled = dbSettings.autoplayEnabled;
          timeout = dbSettings.autoplayTimeout;
        } else {
          // Fallback to legacy localStorage if available
          const legacyAutoplay = localStorage.getItem("bandboard_autoplay_enabled");
          const legacyTimeout = localStorage.getItem("bandboard_autoplay_timeout");

          if (legacyAutoplay !== null) {
            enabled = legacyAutoplay === "true";
            localStorage.removeItem("bandboard_autoplay_enabled");
          }
          if (legacyTimeout !== null) {
            const val = parseInt(legacyTimeout);
            timeout = isNaN(val) ? 5 : val;
            localStorage.removeItem("bandboard_autoplay_timeout");
          }

          // Save migrated values to DB
          await saveUserSettings(undefined, undefined, enabled, timeout);
        }

        setAutoplayEnabled(enabled);
        setTransitionTimeout(timeout);
        setCountdown(timeout);
      } catch (err) {
        console.error("Failed to load autoplay settings:", err);
      }
    }
    loadSettings();
  }, []);

  const currentSong = queue[currentSongIndex]?.song;
  const currentVideoId = currentSong ? getBackingVideoId(currentSong, instrumentPreference) : null;
  const upcomingSong = !hasStartedSession ? currentSong : queue[currentSongIndex + 1]?.song;

  // Sync refs to avoid stale closures in YouTube callbacks
  const autoplayEnabledRef = useRef(autoplayEnabled);
  const transitionTimeoutRef = useRef(transitionTimeout);
  const currentSongIndexRef = useRef(currentSongIndex);
  const queueLengthRef = useRef(queue.length);
  const hasStartedSessionRef = useRef(hasStartedSession);

  useEffect(() => {
    autoplayEnabledRef.current = autoplayEnabled;
  }, [autoplayEnabled]);

  useEffect(() => {
    transitionTimeoutRef.current = transitionTimeout;
  }, [transitionTimeout]);

  useEffect(() => {
    currentSongIndexRef.current = currentSongIndex;
  }, [currentSongIndex]);

  useEffect(() => {
    queueLengthRef.current = queue.length;
  }, [queue.length]);

  useEffect(() => {
    hasStartedSessionRef.current = hasStartedSession;
  }, [hasStartedSession]);

  const handleSongEndedRef = useRef<() => void>(() => {});
  handleSongEndedRef.current = () => {
    if (currentSongIndexRef.current >= queueLengthRef.current - 1) {
      setIsFinished(true);
      setIsPlaying(false);
    } else if (autoplayEnabledRef.current) {
      setCountdown(transitionTimeoutRef.current);
      setIsCountdownActive(true);
      setIsCountdownPaused(false);
    } else {
      setIsPlaying(false);
    }
  };

  // Auto-skip countdown handler
  useEffect(() => {
    if (!isCountdownActive || isCountdownPaused) return;

    if (countdown <= 0) {
      setIsCountdownActive(false);
      if (!hasStartedSession) {
        setHasStartedSession(true);
      } else {
        const nextIndex = currentSongIndex + 1;
        if (nextIndex < queue.length) {
          setCurrentSongIndex(nextIndex);
        }
      }
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isCountdownActive, countdown, isCountdownPaused, currentSongIndex, queue.length, hasStartedSession]);

  // Handle video when currentSongIndex, currentVideoId or hasStartedSession changes
  useEffect(() => {
    if (!apiLoaded || !currentSong) return;
    if (!hasStartedSession) return; // Wait until countdown ends or skip clicked before playing first song

    // Reset countdown states
    setIsCountdownActive(false);
    setIsCountdownPaused(false);
    setCountdown(transitionTimeout);

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
        handleSongEndedRef.current();
      }, 4000);

      return () => clearTimeout(warningTimer);
    }
  }, [currentSongIndex, apiLoaded, currentVideoId, hasStartedSession]);

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
            try {
              event.target.setVolume(volume);
              event.target.setPlaybackRate(speed);
            } catch (e) {}
            if (startOffset > 0) {
              event.target.seekTo(startOffset, true);
            }
          },
          onStateChange: (event: any) => {
            const state = event.data;
            if (state === (window as any).YT.PlayerState.ENDED) {
              handleSongEndedRef.current();
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
    if (!hasStartedSession) {
      setHasStartedSession(true);
    } else {
      const nextIndex = currentSongIndex + 1;
      if (nextIndex < queue.length) {
        setCurrentSongIndex(nextIndex);
      }
    }
  };

  const handleRestartRehearsal = () => {
    setCurrentSongIndex(0);
    setIsFinished(false);
    setHasStartedSession(true);
    setIsCountdownActive(false);
    setIsPlaying(false);
  };

  const handleInstrumentChange = (role: string) => {
    setInstrumentPreference(role);
    toast.success(`Prioritizing ${role} backing tracks`);
  };

  // Save autoplay settings to database for persistence
  const handleAutoplayEnabledChange = async (val: boolean) => {
    setAutoplayEnabled(val);
    await saveUserSettings(undefined, undefined, val, undefined);
    toast.success(`Autoplay next song ${val ? "enabled" : "disabled"}`);
  };

  const handleTimeoutChange = async (val: number) => {
    // If countdown is active, we don't hot-reload countdown directly to prevent timer jump. It updates for next song.
    setTransitionTimeout(val);
    await saveUserSettings(undefined, undefined, autoplayEnabled, val);
  };

  // Keyboard event listener for hotkeys in Autoplay Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip inputs and textareas
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Spacebar to toggle play/pause
      if (e.key === " ") {
        e.preventDefault();
        if (playerRef.current) {
          try {
            const state = playerRef.current.getPlayerState();
            if (state === 1) { // playing
              playerRef.current.pauseVideo();
              setIsPlaying(false);
            } else {
              playerRef.current.playVideo();
              setIsPlaying(true);
            }
          } catch (err) {
            console.error("Error toggling play via Space in autoplay:", err);
          }
        }
        return;
      }

      // Left Arrow to skip backward 5s
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (playerRef.current) {
          try {
            const now = Date.now();
            let baseTime = playerRef.current.getCurrentTime();
            if (seekTargetRef.current !== null && now - lastSeekTimeRef.current < 800) {
              baseTime = seekTargetRef.current;
            }
            let targetTime = Math.max(0, baseTime - 5);
            seekTargetRef.current = targetTime;
            lastSeekTimeRef.current = now;

            playerRef.current.seekTo(targetTime, true);
          } catch (err) {
            console.error("Error seeking back in autoplay:", err);
          }
        }
        return;
      }

      // Right Arrow to skip forward 5s
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (playerRef.current) {
          try {
            const now = Date.now();
            let baseTime = playerRef.current.getCurrentTime();
            if (seekTargetRef.current !== null && now - lastSeekTimeRef.current < 800) {
              baseTime = seekTargetRef.current;
            }
            let targetTime = baseTime + 5;
            const duration = playerRef.current.getDuration();
            if (duration && targetTime > duration) {
              targetTime = duration;
            }
            seekTargetRef.current = targetTime;
            lastSeekTimeRef.current = now;

            playerRef.current.seekTo(targetTime, true);
          } catch (err) {
            console.error("Error seeking forward in autoplay:", err);
          }
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Monitor when focus shifts to iframe and redirect it back to parent window
  useEffect(() => {
    let iframeFocused = false;
    let lastTime = -1;
    let lastState = -1;
    let focusTimeout: any = null;

    const restoreFocus = () => {
      if (document.activeElement && document.activeElement.tagName === "IFRAME") {
        (document.activeElement as HTMLElement).blur();
        window.focus();
      }
      iframeFocused = false;
      if (focusTimeout) {
        clearTimeout(focusTimeout);
        focusTimeout = null;
      }
    };

    const handleBlur = () => {
      setTimeout(() => {
        if (document.activeElement && document.activeElement.tagName === "IFRAME") {
          iframeFocused = true;
          
          if (focusTimeout) clearTimeout(focusTimeout);
          // Initial timeout: restore focus in 50ms
          focusTimeout = setTimeout(restoreFocus, 50);

          if (playerRef.current) {
            try {
              if (typeof playerRef.current.getCurrentTime === "function") lastTime = playerRef.current.getCurrentTime();
              if (typeof playerRef.current.getPlayerState === "function") lastState = playerRef.current.getPlayerState();
            } catch (e) {}
          }
        }
      }, 50);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (e.buttons > 0) return;

      if (iframeFocused && document.activeElement && document.activeElement.tagName === "IFRAME") {
        restoreFocus();
      }
    };

    const interval = setInterval(() => {
      if (!iframeFocused || !document.activeElement || document.activeElement.tagName !== "IFRAME") {
        return;
      }

      if (playerRef.current) {
        try {
          let currentTime = lastTime;
          let currentState = lastState;

          if (typeof playerRef.current.getCurrentTime === "function") currentTime = playerRef.current.getCurrentTime();
          if (typeof playerRef.current.getPlayerState === "function") currentState = playerRef.current.getPlayerState();

          const timeDiff = currentTime - lastTime;
          const isPlaying = currentState === 1;
          const isNaturalPlayback = isPlaying && Math.abs(timeDiff - 0.1) < 0.08;

          const stateChanged = currentState !== lastState;
          const userSeeked = !isNaturalPlayback && Math.abs(timeDiff) > 0.8;

          if (stateChanged || userSeeked) {
            lastTime = currentTime;
            lastState = currentState;

            if (focusTimeout) clearTimeout(focusTimeout);
            focusTimeout = setTimeout(restoreFocus, 50);
          } else {
            lastTime = currentTime;
          }
        } catch (e) {}
      }
    }, 100);

    window.addEventListener("blur", handleBlur);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("mousemove", handleMouseMove);
      clearInterval(interval);
      if (focusTimeout) clearTimeout(focusTimeout);
    };
  }, []);

  // Circular progress countdown SVG calculations
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (countdown / transitionTimeout) * circumference;

  const nextSong = queue[currentSongIndex + 1]?.song;

  return (
    <div className="fixed inset-0 z-50 bg-[#0c0d0e] text-[#f1f2f4] flex flex-col h-screen overflow-hidden">
      {/* Autoplay Header styled like single song practice mode */}
      <header className="flex items-center justify-between border-b border-[#27282b] bg-[#161719]/40 px-6 py-4 flex-shrink-0 w-full">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={onExit}
            className="text-[#888d96] hover:text-[#f1f2f4] rounded-xl border border-[#27282b] bg-[#161719]/40 h-10 px-3 flex items-center gap-1.5 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit Practice Mode
          </Button>
          <div>
            <h2 className="text-sm font-bold text-[#f1f2f4] truncate">
              {rehearsal.title}
            </h2>
            <div className="flex items-center gap-2 text-[10px] text-[#888d96] mt-0.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date(rehearsal.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center flex-shrink-0">
          <PrivateIndicator
            text="Settings synced only for you"
            tooltip="All settings, offsets, markers, and autoplay preferences are private to your device."
          />
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left Column: Player (70%) */}
        <div className="flex-1 lg:flex-[7] flex flex-col justify-center min-h-0 overflow-y-auto lg:overflow-hidden bg-[#0c0d0e]/60">
          <div className="w-full max-w-4xl mx-auto flex flex-col gap-4 h-full justify-center">
            {/* Player aspect wrapper */}
            <div
              className="w-full aspect-video bg-black border border-[#27282b] rounded-2xl overflow-hidden relative shadow-2xl shadow-black/90 flex-shrink-0"
              onMouseEnter={() => {
                isMouseOverPlayerRef.current = true;
              }}
              onMouseLeave={() => {
                isMouseOverPlayerRef.current = false;
                if (document.activeElement && document.activeElement.tagName === "IFRAME") {
                  (document.activeElement as HTMLElement).blur();
                  window.focus();
                }
              }}
            >
              {/* YouTube Iframe element */}
              <div
                id="autoplay-player-div"
                className={cn("w-full h-full aspect-video", (!currentVideoId || !hasStartedSession) ? "hidden" : "")}
              />

              {/* Transparent overlay to block native volume controls in YouTube iframe */}
              {currentVideoId && hasStartedSession && (
                <div
                  className="absolute left-[44px] bottom-0 w-[48px] h-[36px] z-10 bg-transparent cursor-default"
                  title="Volume controlled via sidebar settings"
                />
              )}



              {/* HUD: Countdown overlay */}
              {isCountdownActive && upcomingSong && (
                <div className="absolute inset-0 z-30 bg-[#0c0d0e]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                  <div className="space-y-4 max-w-sm flex flex-col items-center">
                    <p className="text-[10px] font-bold text-[#888d96] uppercase tracking-widest">
                      {!hasStartedSession ? "Starting Rehearsal In" : "Up Next In"}
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
                          className="stroke-[#acd1f8]"
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
                        {upcomingSong.title}
                      </h3>
                      <p className="text-xs text-[#888d96] line-clamp-1">
                        by {upcomingSong.artist}
                      </p>
                    </div>

                    {/* Control HUD Buttons */}
                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        size="sm"
                        onClick={() => setIsCountdownPaused(!isCountdownPaused)}
                        className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl text-xs font-bold px-4 h-9 animate-none"
                      >
                        {isCountdownPaused ? "Resume Autoplay" : "Pause Timer"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSkipCountdown}
                        className="bg-[#acd1f8] hover:bg-[#bce0ff] text-[#0c0d0e] rounded-xl text-xs font-black px-4 h-9 animate-none"
                      >
                        {!hasStartedSession ? "Start Now" : "Play Now"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* HUD: Warning overlay when no video exists */}
              {!currentVideoId && !isCountdownActive && !isFinished && currentSong && hasStartedSession && (
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
                        className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-xs font-bold rounded-xl h-8 px-3 animate-none"
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
                        className="bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4] rounded-xl text-xs font-bold px-4 h-10 animate-none"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restart Setlist
                      </Button>
                      <Button
                        onClick={onExit}
                        className="bg-[#acd1f8] hover:bg-[#bce0ff] text-[#0c0d0e] rounded-xl text-xs font-black px-4 h-10 animate-none"
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
                  {/* Now Playing Tuning badges */}
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
                              ind.role.toLowerCase() === instrumentPreference.toLowerCase()
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
                      className="h-9 w-9 border-[#27282b] bg-[#0c0d0e]/40 hover:bg-[#27282b] text-[#888d96] hover:text-[#f1f2f4] rounded-lg disabled:opacity-30 flex items-center justify-center cursor-pointer"
                      title="Previous Song"
                    >
                      <SkipBack className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleTogglePlay}
                      disabled={!currentVideoId || !hasStartedSession}
                      className="h-9 w-9 border-[#27282b] bg-[#0c0d0e]/40 hover:bg-[#27282b] text-[#acd1f8] hover:text-white rounded-lg flex items-center justify-center cursor-pointer"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={currentSongIndex === queue.length - 1}
                      onClick={handleNextSong}
                      className="h-9 w-9 border-[#27282b] bg-[#0c0d0e]/40 hover:bg-[#27282b] text-[#888d96] hover:text-[#f1f2f4] rounded-lg disabled:opacity-30 flex items-center justify-center cursor-pointer"
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
          {/* Instrument Selection & Autoplay Settings */}
          <div className="p-4 border-b border-[#27282b] space-y-4 flex-shrink-0 bg-[#161719]/40">
            {/* Instrument selector tabs */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider block">
                Practice Instrument
              </label>
              <Tabs value={instrumentPreference} onValueChange={handleInstrumentChange} className="w-full">
                <TabsList className="bg-[#0c0d0e] border border-[#27282b] p-0.5 rounded-xl h-auto flex w-full">
                  {["Guitar", "Bass", "Vocals", "Drums", "Keys"].map((inst) => (
                    <TabsTrigger
                      key={inst}
                      value={inst}
                      className="px-1 py-1 text-[10px] font-bold rounded-lg data-[state=active]:bg-[#27282b] data-[state=active]:text-[#f1f2f4] text-[#888d96] hover:text-[#f1f2f4] transition-all cursor-pointer flex-1 text-center"
                    >
                      {inst === "Keys" ? "Piano" : inst}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* Autoplay toggle (styled as dual button) and countdown duration */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider block">
                  Auto-advance
                </label>
                <div className="flex bg-[#0c0d0e]/60 p-1 border border-[#27282b] rounded-xl gap-1 w-full justify-between">
                  <Button
                    onClick={() => handleAutoplayEnabledChange(true)}
                    className={cn(
                      "text-xs font-bold px-3 py-1 h-7 rounded-lg transition-all border-0 flex-1 cursor-pointer animate-none",
                      autoplayEnabled
                        ? "bg-[#2e4057] text-[#acd1f8] hover:bg-[#2e4057] hover:text-[#acd1f8]"
                        : "bg-transparent text-[#888d96] hover:text-[#f1f2f4] hover:bg-[#161719]/40"
                    )}
                  >
                    On
                  </Button>
                  <Button
                    onClick={() => handleAutoplayEnabledChange(false)}
                    className={cn(
                      "text-xs font-bold px-3 py-1 h-7 rounded-lg transition-all border-0 flex-1 cursor-pointer animate-none",
                      !autoplayEnabled
                        ? "bg-[#2e4057] text-[#acd1f8] hover:bg-[#2e4057] hover:text-[#acd1f8]"
                        : "bg-transparent text-[#888d96] hover:text-[#f1f2f4] hover:bg-[#161719]/40"
                    )}
                  >
                    Off
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <span className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider block">Transition Timer:</span>
                <div className="flex items-center bg-[#0c0d0e]/60 border border-[#27282b] rounded-lg overflow-hidden h-7 w-20 justify-between">
                  <button
                    type="button"
                    onClick={() => handleTimeoutChange(Math.max(1, transitionTimeout - 1))}
                    className="text-xs font-bold text-[#888d96] hover:text-[#f1f2f4] px-1.5 h-full hover:bg-[#27282b]/50 border-r border-[#27282b] cursor-pointer flex items-center justify-center"
                  >
                    -
                  </button>
                  <span className="text-[10px] font-mono text-[#f1f2f4] font-bold w-full text-center">
                    {transitionTimeout}s
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTimeoutChange(Math.min(60, transitionTimeout + 1))}
                    className="text-xs font-bold text-[#888d96] hover:text-[#f1f2f4] px-1.5 h-full hover:bg-[#27282b]/50 border-l border-[#27282b] cursor-pointer flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Volume Slider Control */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider block">
                    Volume
                  </label>
                  <span className="text-[10px] font-mono text-[#acd1f8] font-bold">
                    {volume}%
                  </span>
                </div>
                <div className="flex items-center bg-[#0c0d0e]/60 border border-[#27282b] px-3.5 py-2 rounded-xl gap-3">
                  <button
                    onClick={() => setVolume(v => v === 0 ? 100 : 0)}
                    className="text-[#acd1f8] hover:text-white transition-colors cursor-pointer border-0 bg-transparent p-0 flex items-center"
                  >
                    {volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                  <Slider
                    value={[volume]}
                    onValueChange={(val) => setVolume(Array.isArray(val) ? val[0] : val)}
                    min={0}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Playback Speed Control Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-[#888d96] uppercase tracking-wider block">
                    Playback Speed
                  </label>
                  <span className="text-[10px] font-mono text-[#acd1f8] font-bold">
                    {speed.toFixed(2)}x
                  </span>
                </div>
                <div className="flex items-center bg-[#0c0d0e]/60 border border-[#27282b] px-3.5 py-2 rounded-xl gap-3">
                  <span className="text-[#acd1f8] flex items-center"><Gauge className="w-3.5 h-3.5" /></span>
                  <Slider
                    value={[speed]}
                    onValueChange={(val) => setSpeed(Array.isArray(val) ? val[0] : val)}
                    min={0.5}
                    max={2.0}
                    step={0.05}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Queue Header */}
          <div className="p-4 border-b border-[#27282b] flex-shrink-0 flex items-center justify-between bg-[#161719]/10">
            <h3 className="text-xs font-bold text-[#f1f2f4] uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#888d96]" />
              Setlist Queue
            </h3>
            <span className="text-[10px] font-bold text-[#888d96] bg-[#0c0d0e] border border-[#27282b] px-2 py-0.5 rounded-md">
              {queue.length} songs
            </span>
          </div>

          {/* Queue list */}
          <div className="flex-grow overflow-y-auto p-3 space-y-2.5 min-h-0 scrollbar-thin">
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
                    "flex flex-col p-3 rounded-xl border transition-all duration-200 cursor-pointer select-none gap-2",
                    isSongActive
                      ? "bg-[#27282b] border-[#5b80a5]/45 shadow-md shadow-[#0c0d0e]/40"
                      : isSongCompleted
                      ? "bg-[#0c0d0e]/20 border-[#27282b]/60 opacity-60 hover:opacity-90 hover:border-[#383a3f]"
                      : "bg-[#0c0d0e]/40 border-[#27282b]/80 hover:bg-[#161719]/40 hover:border-[#383a3f]"
                  )}
                >
                  <div className="flex items-center justify-between">
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
                        <p className="text-[10px] text-[#888d96] truncate mt-0.5 font-medium">
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

                  {/* Tunings in queue */}
                  {(() => {
                    const songTunings = getSongTunings(song);
                    if (songTunings.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-1.5 pl-8 mt-0.5">
                        {songTunings.map((ind) => {
                          const isMatch = ind.role.toLowerCase() === instrumentPreference.toLowerCase();
                          return (
                            <Badge
                              key={`${ind.role}-${ind.tuning}`}
                              className={cn(
                                "text-[7.5px] font-mono tracking-wide px-1.5 py-0.5 border shrink-0 bg-transparent leading-none",
                                isMatch
                                  ? "border-[#446285] text-[#acd1f8] font-bold"
                                  : "border-[#27282b] text-[#6c727a]"
                              )}
                            >
                              {ind.tuning}
                            </Badge>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
