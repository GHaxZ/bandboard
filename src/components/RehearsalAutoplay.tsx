"use client";

import { useEffect, useState, useRef } from "react";
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
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { getSongTunings } from "@/lib/tunings";
import { PrivateIndicator } from "./PrivateIndicator";
import { CustomPlaybackHUD } from "./CustomPlaybackHUD";
import { ClientDate } from "./ClientDate";
import { toast } from "sonner";
import { getUserSettings, saveUserSettings } from "@/app/actions/user";
import type { RehearsalDetails, ProgressMap } from "@/types/models";
import { resolveBackingMedia } from "@/lib/backing-media";
import { useAutoplayEngine } from "@/hooks/useAutoplayEngine";
import { useIframeFocusGuard } from "@/hooks/useIframeFocusGuard";
import { usePracticeKeyboard } from "@/hooks/usePracticeKeyboard";
import { usePlayerStore } from "@/stores/player-store";
import { NO_VIDEO_SKIP_MS, SEEK_STEP_S } from "@/lib/constants";
import type { Role } from "@/lib/constants";

interface RehearsalAutoplayProps {
  rehearsal: RehearsalDetails;
  onExit: () => void;
  preferredInstrument: Role;
  progressMap: ProgressMap;
}

export function RehearsalAutoplay({
  rehearsal,
  onExit,
  preferredInstrument,
  progressMap,
}: RehearsalAutoplayProps) {
  const queue = [...rehearsal.rehearsalSongs].sort((a, b) => a.sortOrder - b.sortOrder);

  // Store-backed state
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const setCurrentIndex = usePlayerStore((s) => s.setCurrentIndex);
  const sessionStarted = usePlayerStore((s) => s.sessionStarted);
  const startSession = usePlayerStore((s) => s.startSession);
  const finished = usePlayerStore((s) => s.finished);
  const finish = usePlayerStore((s) => s.finish);
  const restart = usePlayerStore((s) => s.restart);
  const countdown = usePlayerStore((s) => s.countdown);
  const countdownPaused = usePlayerStore((s) => s.countdownPaused);
  const transitionTimeout = usePlayerStore((s) => s.transitionTimeout);
  const setTransitionTimeout = usePlayerStore((s) => s.setTransitionTimeout);
  const autoplayEnabled = usePlayerStore((s) => s.autoplayEnabled);
  const setAutoplayEnabled = usePlayerStore((s) => s.setAutoplayEnabled);
  const startCountdown = usePlayerStore((s) => s.startCountdown);
  const tickCountdown = usePlayerStore((s) => s.tickCountdown);
  const pauseCountdown = usePlayerStore((s) => s.pauseCountdown);
  const skipCountdown = usePlayerStore((s) => s.skipCountdown);
  const skipReason = usePlayerStore((s) => s.skipReason);
  const triggerNoVideo = usePlayerStore((s) => s.triggerNoVideo);
  const clearSkipReason = usePlayerStore((s) => s.clearSkipReason);
  const reset = usePlayerStore((s) => s.reset);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const speed = usePlayerStore((s) => s.speed);
  const setSpeed = usePlayerStore((s) => s.setSpeed);

  const [instrumentPreference, setInstrumentPreference] = useState<Role>(preferredInstrument);

  const [skipOverlay, setSkipOverlay] = useState<{ type: "back" | "forward"; key: number } | null>(null);
  const skipOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load autoplay settings from DB, then bootstrap countdown
  useEffect(() => {
    const settingsPromise = getUserSettings().then((s) => {
      setAutoplayEnabled(s.autoplayEnabled);
      setTransitionTimeout(s.autoplayTimeout);
    });
    settingsPromise.then(() => {
      if (!sessionStarted && countdown === null && !finished) {
        startCountdown();
      }
    });
    return () => {
      if (skipOverlayTimeoutRef.current) clearTimeout(skipOverlayTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown ticker
  useEffect(() => {
    if (countdown === null || countdownPaused) return;
    if (countdown <= 0) {
      if (!sessionStarted) {
        startSession();
      } else {
        setCurrentIndex(Math.min(currentIndex + 1, queue.length - 1));
      }
      return;
    }
    const t = setTimeout(() => tickCountdown(), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, countdownPaused, sessionStarted, currentIndex, queue.length]);

  const currentSong = queue[currentIndex]?.song;
  const backingMedia = currentSong
    ? resolveBackingMedia(currentSong, instrumentPreference, progressMap[currentSong.id])
    : { kind: 'none' as const };
  const customTrack = backingMedia.kind === 'custom-file'
    ? currentSong?.customTracks?.find((t) => t.id === backingMedia.customTrackId)
    : undefined;
  const coverArtUrl = currentSong?.coverArtStoredName
    ? `/api/cover-art/${currentSong.id}?v=${currentSong.coverArtStoredName}`
    : currentSong?.albumArt || null;
  const upcomingSong = !sessionStarted ? currentSong : queue[currentIndex + 1]?.song;

  // No-video path: 4s timer then advance
  useEffect(() => {
    if (!sessionStarted || finished) return;
    if (backingMedia.kind !== "none" || skipReason !== "no_video") return;
    const t = setTimeout(() => {
      // treat as ended
      if (currentIndex >= queue.length - 1) {
        finish();
      } else if (autoplayEnabled) {
        startCountdown();
      } else {
        setPlaying(false);
      }
    }, NO_VIDEO_SKIP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStarted, finished, backingMedia.kind, skipReason, currentIndex, queue.length]);

  // Detect no-video on song change once session started
  useEffect(() => {
    if (!sessionStarted || finished) return;
    if (backingMedia.kind === "none" && skipReason !== "no_video") {
      triggerNoVideo();
    } else if (backingMedia.kind !== "none" && skipReason === "no_video") {
      clearSkipReason();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backingMedia.kind, sessionStarted]);

  // Multistem autostart: play when session starts or song changes (but don't force-play after a user pause)
  useEffect(() => {
    if (sessionStarted && backingMedia.kind === "multistem") {
      setPlaying(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStarted, backingMedia.kind, currentSong?.id]);

  const onEnded = () => {
    if (currentIndex >= queue.length - 1) {
      finish();
    } else if (autoplayEnabled) {
      startCountdown();
    } else {
      setPlaying(false);
    }
  };

  const { playPause, seekBy, seekTo: autoplaySeekTo, getCurrentTime: autoplayGetCurrentTime, getDuration: autoplayGetDuration, renderMedia } = useAutoplayEngine({
    media: backingMedia,
    customTrack,
    sessionStarted,
    onEnded,
    coverArtUrl,
  });

  // Skip overlay helper
  const triggerSkipOverlay = (type: "back" | "forward") => {
    if (skipOverlayTimeoutRef.current) clearTimeout(skipOverlayTimeoutRef.current);
    setSkipOverlay({ type, key: Date.now() });
    skipOverlayTimeoutRef.current = setTimeout(() => setSkipOverlay(null), 600);
  };

  // Keyboard
  usePracticeKeyboard({
    onPlayPause: playPause,
    onSeekBackward: () => {
      seekBy(-SEEK_STEP_S);
      triggerSkipOverlay("back");
    },
    onSeekForward: () => {
      seekBy(SEEK_STEP_S);
      triggerSkipOverlay("forward");
    },
  });

  useIframeFocusGuard();

  // Reset store on unmount
  useEffect(() => {
    return () => reset();
  }, [reset]);

  const handleTogglePlay = () => playPause();
  const handlePrevSong = () => currentIndex > 0 && setCurrentIndex(currentIndex - 1);
  const handleNextSong = () => currentIndex < queue.length - 1 && setCurrentIndex(currentIndex + 1);
  const handleSkipCountdown = () => skipCountdown(queue.length);
  const handleRestart = () => restart();

  const handleInstrumentChange = (role: string) => {
    setInstrumentPreference(role as Role);
    toast.success(`Prioritizing ${role} backing tracks`);
  };

  const handleAutoplayEnabledChange = async (val: boolean) => {
    setAutoplayEnabled(val);
    await saveUserSettings({ autoplayEnabled: val });
    toast.success(`Autoplay next song ${val ? "enabled" : "disabled"}`);
  };

  const handleTimeoutChange = async (val: number) => {
    setTransitionTimeout(val);
    await saveUserSettings({ autoplayTimeout: val, autoplayEnabled });
  };

  // Circular countdown
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const totalForRing = transitionTimeout || 1;
  const dashOffset = circumference - ((countdown ?? 0) / totalForRing) * circumference;

  return (
    <div className="fixed inset-0 z-50 h-dvh bg-background text-foreground flex flex-col overflow-hidden" data-media-surface>
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-6 py-4 flex-shrink-0 w-full">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={onExit}
            className="text-muted-foreground hover:text-foreground rounded-xl border border-border bg-card/40 h-10 px-3 flex items-center gap-1.5 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit Practice Mode
          </Button>
          <div>
            <h2 className="text-sm font-bold text-foreground truncate">{rehearsal.title}</h2>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                <ClientDate ms={rehearsal.date} variant="date" />
              </span>
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

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Player */}
        <div className="flex-1 lg:flex-[7] flex flex-col justify-center min-h-0 overflow-y-auto lg:overflow-hidden bg-background/60">
          <div className="w-full max-w-4xl mx-auto flex flex-col gap-4 h-full justify-center">
            <div
              className="w-full aspect-video bg-black border border-border rounded-2xl overflow-hidden relative shadow-2xl shadow-black/90 flex-shrink-0"
              onMouseLeave={() => {
                if (document.activeElement && document.activeElement.tagName === "IFRAME") {
                  (document.activeElement as HTMLElement).blur();
                  window.focus();
                }
              }}
            >
              <div
                id="autoplay-player-div"
                className={cn(
                  "w-full h-full aspect-video",
                  backingMedia.kind !== "youtube" || !sessionStarted ? "hidden" : ""
                )}
              />

              {renderMedia}

              {/* Custom HUD for all media types */}
              {sessionStarted && (
                <CustomPlaybackHUD
                  engine={{
                    playPause,
                    seekBy,
                    seekTo: autoplaySeekTo,
                    getCurrentTime: autoplayGetCurrentTime,
                    get duration() { return autoplayGetDuration(); },
                    get isPlaying() { return usePlayerStore.getState().isPlaying; },
                  }}
                  isPlaying={isPlaying}
                />
              )}

              {backingMedia.kind === "youtube" && sessionStarted && (
                <div
                  className="absolute left-[44px] bottom-0 w-[48px] h-[36px] z-10 bg-transparent cursor-default"
                  title="Volume controlled via sidebar settings"
                />
              )}

              {skipOverlay && (
                <div
                  key={skipOverlay.key}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 bg-transparent"
                >
                  <div className="bg-black/80 text-foreground rounded-full w-24 h-24 flex flex-col items-center justify-center backdrop-blur-md border border-white/10 animate-skip-alert shadow-2xl">
                    <span className="text-2xl font-bold">
                      {skipOverlay.type === "back" ? "◀◀" : "▶▶"}
                    </span>
                    <span className="text-xs font-bold font-mono mt-0.5">
                      {skipOverlay.type === "back" ? "-5s" : "+5s"}
                    </span>
                  </div>
                </div>
              )}

              {/* Countdown overlay */}
              {countdown !== null && upcomingSong && !finished && (
                <div className="absolute inset-0 z-30 bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                  <div className="space-y-4 max-w-sm flex flex-col items-center">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      {!sessionStarted ? "Starting Rehearsal In" : "Up Next In"}
                    </p>
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
                          strokeDashoffset={dashOffset}
                        />
                      </svg>
                      <span className="absolute text-2xl font-black text-[#acd1f8]">{countdown}</span>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-base font-black text-foreground leading-snug line-clamp-1">
                        {upcomingSong.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        by {upcomingSong.artist}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        size="sm"
                        onClick={() => pauseCountdown(!countdownPaused)}
                        className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl text-xs font-bold px-4 h-9 animate-none"
                      >
                        {countdownPaused ? "Resume Autoplay" : "Pause Timer"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSkipCountdown}
                        className="bg-[#acd1f8] hover:bg-[#bce0ff] text-[#0c0d0e] rounded-xl text-xs font-black px-4 h-9 animate-none"
                      >
                        {!sessionStarted ? "Start Now" : "Play Now"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* No-video overlay */}
              {backingMedia.kind === "none" && countdown === null && !finished && currentSong && sessionStarted && (
                <div className="absolute inset-0 z-20 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                  <div className="space-y-3 max-w-md flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-[#3b1c1c] border border-red-900/60 flex items-center justify-center text-red-400 mb-2">
                      <Music className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-red-400">No Backing Track Found</h3>
                    <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                      Could not find a valid backing track or video link for{" "}
                      <span className="font-bold text-foreground">&quot;{currentSong.title}&quot;</span>.
                      Skipping in a few seconds...
                    </p>
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={handleNextSong}
                        className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-xs font-bold rounded-xl h-8 px-3 animate-none"
                      >
                        Skip Song
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Finished overlay */}
              {finished && (
                <div className="absolute inset-0 z-30 bg-background/98 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                  <div className="space-y-4 max-w-sm flex flex-col items-center">
                    <div className="w-14 h-14 rounded-full bg-[#1b3b2b] border border-emerald-900/60 flex items-center justify-center text-emerald-400 mb-2">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-lg font-black text-foreground">Rehearsal Prep Complete!</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        You played through all the backing tracks in your setlist sequence.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 pt-3">
                      <Button
                        onClick={handleRestart}
                        className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl text-xs font-bold px-4 h-10 animate-none"
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

            {/* Now-playing footer */}
            {currentSong && (
              <div className="bg-card/40 border border-border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-shrink-0 shadow-lg">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
                    Now Playing (Song {currentIndex + 1} of {queue.length})
                  </span>
                  <h3 className="text-lg font-black text-foreground mt-1 truncate">
                    {currentSong.title}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    by {currentSong.artist}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {(() => {
                    const tunings = getSongTunings(currentSong);
                    if (tunings.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-1">
                        {tunings.map((ind) => (
                          <Badge
                            key={`${ind.role}-${ind.tuning}`}
                            className={cn(
                              "text-[8px] font-mono tracking-wide px-1.5 py-0.5 border shrink-0",
                              ind.role.toLowerCase() === instrumentPreference.toLowerCase()
                                ? "bg-[#2e4057]/45 border-[#446285]/55 text-[#acd1f8]"
                                : "bg-card/40 border-border text-[#6c727a]"
                            )}
                          >
                            {ind.tuning}
                          </Badge>
                        ))}
                      </div>
                    );
                  })()}

                  <div className="flex items-center gap-1.5 border-l border-border pl-3.5">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={currentIndex === 0}
                      onClick={handlePrevSong}
                      className="h-9 w-9 border-border bg-background/40 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 flex items-center justify-center cursor-pointer"
                      title="Previous Song"
                    >
                      <SkipBack className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleTogglePlay}
                      disabled={backingMedia.kind === "none" || !sessionStarted}
                      className="h-9 w-9 border-border bg-background/40 hover:bg-muted text-[#acd1f8] hover:text-white rounded-lg flex items-center justify-center cursor-pointer"
                      title={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={currentIndex === queue.length - 1}
                      onClick={handleNextSong}
                      className="h-9 w-9 border-border bg-background/40 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg disabled:opacity-30 flex items-center justify-center cursor-pointer"
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

        {/* Sidebar */}
        <div className="w-full lg:w-80 lg:border-l border-border bg-card/10 flex flex-col overflow-hidden flex-shrink-0 min-h-0">
          <div className="p-4 border-b border-border space-y-4 flex-shrink-0 bg-card/40">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Practice Instrument
              </label>
              <Tabs
                value={instrumentPreference}
                onValueChange={handleInstrumentChange}
                className="w-full"
              >
                <TabsList className="bg-background border border-border p-0.5 rounded-xl h-auto flex w-full">
                  {(["Guitar", "Bass", "Vocals", "Drums", "Piano/Keyboard"] as Role[]).map((inst) => (
                    <TabsTrigger
                      key={inst}
                      value={inst}
                      className="px-1 py-1 text-[10px] font-bold rounded-lg data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all cursor-pointer flex-1 text-center"
                    >
                      {inst === "Piano/Keyboard" ? "Piano" : inst}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Auto-advance
                </label>
                <div className="flex bg-background/60 p-1 border border-border rounded-xl gap-1 w-full justify-between">
                  <Button
                    onClick={() => handleAutoplayEnabledChange(true)}
                    className={cn(
                      "text-xs font-bold px-3 py-1 h-7 rounded-lg transition-all border-0 flex-1 cursor-pointer animate-none",
                      autoplayEnabled
                        ? "bg-[#2e4057] text-[#acd1f8] hover:bg-[#2e4057] hover:text-[#acd1f8]"
                        : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-card/40"
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
                        : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-card/40"
                    )}
                  >
                    Off
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Transition Timer:
                </span>
                <div className="flex items-center bg-background/60 border border-border rounded-lg overflow-hidden h-7 w-20 justify-between">
                  <button
                    type="button"
                    onClick={() => handleTimeoutChange(Math.max(1, transitionTimeout - 1))}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground px-1.5 h-full hover:bg-muted/50 border-r border-border cursor-pointer flex items-center justify-center"
                  >
                    -
                  </button>
                  <span className="text-[10px] font-mono text-foreground font-bold w-full text-center">
                    {transitionTimeout}s
                  </span>
                  <button
                    type="button"
                    onClick={() => handleTimeoutChange(Math.min(60, transitionTimeout + 1))}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground px-1.5 h-full hover:bg-muted/50 border-l border-border cursor-pointer flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Volume
                  </label>
                  <span className="text-[10px] font-mono text-[#acd1f8] font-bold">{volume}%</span>
                </div>
                <div className="flex items-center bg-background/60 border border-border px-3.5 py-2 rounded-xl gap-3">
                  <button
                    onClick={() => setVolume(volume === 0 ? 100 : 0)}
                    className="text-[#acd1f8] hover:text-white transition-colors cursor-pointer border-0 bg-transparent p-0 flex items-center"
                  >
                    {volume === 0 ? (
                      <VolumeX className="w-3.5 h-3.5" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5" />
                    )}
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

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Playback Speed
                  </label>
                  <span className="text-[10px] font-mono text-[#acd1f8] font-bold">
                    {speed.toFixed(2)}x
                  </span>
                </div>
                <div className="flex items-center bg-background/60 border border-border px-3.5 py-2 rounded-xl gap-3">
                  <span className="text-[#acd1f8] flex items-center">
                    <Gauge className="w-3.5 h-3.5" />
                  </span>
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

          {/* Queue */}
          <div className="p-4 border-b border-border flex-shrink-0 flex items-center justify-between bg-card/10">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Setlist Queue
            </h3>
            <span className="text-[10px] font-bold text-muted-foreground bg-background border border-border px-2 py-0.5 rounded-md">
              {queue.length} songs
            </span>
          </div>

          <div className="flex-grow overflow-y-auto p-3 space-y-2.5 min-h-0 scrollbar-thin">
            {queue.map((rs, index) => {
              const isSongActive = index === currentIndex;
              const isSongCompleted = index < currentIndex;
              const isSongNext = index === currentIndex + 1;
              return (
                <div
                  key={rs.songId}
                  onClick={() => setCurrentIndex(index)}
                  className={cn(
                    "flex flex-col p-3 rounded-xl border transition-all duration-200 cursor-pointer select-none gap-2",
                    isSongActive
                      ? "bg-muted border-[#5b80a5]/45 shadow-md shadow-[#0c0d0e]/40"
                      : isSongCompleted
                        ? "bg-background/20 border-border/60 opacity-60 hover:opacity-90 hover:border-[#383a3f]"
                        : "bg-background/40 border-border/80 hover:bg-card/40 hover:border-[#383a3f]"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <span className="text-xs font-mono font-bold text-muted-foreground w-5 text-right flex-shrink-0">
                        {index + 1}.
                      </span>
                      {(() => {
                        const art = rs.song.coverArtStoredName
                          ? `/api/cover-art/${rs.song.id}?v=${rs.song.coverArtStoredName}`
                          : rs.song.albumArt;
                        return art ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={art} alt="" className="w-8 h-8 rounded-lg object-cover border border-border flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center flex-shrink-0">
                            <Music className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        );
                      })()}
                      <div className="min-w-0 flex-grow">
                        <h4
                          className={cn(
                            "text-xs font-bold truncate",
                            isSongActive ? "text-foreground" : "text-[#d1d1d6]"
                          )}
                        >
                          {rs.song.title}
                        </h4>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5 font-medium">
                          {rs.song.artist}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center flex-shrink-0">
                      {isSongCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : isSongActive ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#acd1f8] animate-pulse shadow-[0_0_8px_#acd1f8]" />
                      ) : isSongNext ? (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      ) : null}
                    </div>
                  </div>

                  {(() => {
                    const tunings = getSongTunings(rs.song);
                    if (tunings.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-1.5 pl-8 mt-0.5">
                        {tunings.map((ind) => {
                          const isMatch =
                            ind.role.toLowerCase() === instrumentPreference.toLowerCase();
                          return (
                            <Badge
                              key={`${ind.role}-${ind.tuning}`}
                              className={cn(
                                "text-[7.5px] font-mono tracking-wide px-1.5 py-0.5 border shrink-0 bg-transparent leading-none",
                                isMatch
                                  ? "border-[#446285] text-[#acd1f8] font-bold"
                                  : "border-border text-[#6c727a]"
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
