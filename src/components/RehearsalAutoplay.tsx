"use client";

import { useEffect, useState, useMemo, useRef } from "react";
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
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { TuningBadges } from "./TuningBadges";
import { PrivateIndicator } from "./PrivateIndicator";
import { CustomPlaybackHUD } from "./CustomPlaybackHUD";
import { ClientDate } from "./ClientDate";
import { toast } from "sonner";
import { getUserSettings, saveUserSettings } from "@/app/actions/user";
import { readDeviceVolumeClient, readDeviceSpeedClient, writeDeviceVolume, writeDeviceSpeed } from "@/lib/device-media";
import type { RehearsalDetails, ProgressMap, Song } from "@/types/models";
import { resolveBackingMedia } from "@/lib/backing-media";
import { getSongDetails, lazyLoadTrackMedia } from "@/app/actions/songs";
import { getYouTubeId } from "@/lib/youtube";
import { useAutoplayEngine } from "@/hooks/useAutoplayEngine";
import { useIframeFocusGuard, blurActiveIframe } from "@/hooks/useIframeFocusGuard";
import { usePracticeKeyboard } from "@/hooks/usePracticeKeyboard";
import { useSkipOverlay } from "@/hooks/useSkipOverlay";
import { usePlayerStore } from "@/stores/player-store";
import { getCoverArtUrl } from "./CoverArt";
import { NO_VIDEO_SKIP_MS, SEEK_STEP_S, INSTRUMENT_ROLES, ROLE_LABEL } from "@/lib/constants";
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
  // Songs refreshed after an in-session lazy media load override the props.
  const [songOverrides, setSongOverrides] = useState<Record<string, Song>>({});
  const queue = useMemo(
    () =>
      [...rehearsal.rehearsalSongs]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((rs) => ({ ...rs, song: songOverrides[rs.songId] ?? rs.song })),
    [rehearsal.rehearsalSongs, songOverrides]
  );

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

  // Skip overlay
  const { skipOverlay, triggerSkipOverlay, clearSkipOverlayTimer } = useSkipOverlay();

  // Load autoplay settings from DB, then bootstrap countdown. If the settings
  // fetch rejects, still bootstrap — otherwise the session sits on the
  // countdown overlay forever with an unhandled rejection.
  useEffect(() => {
    getUserSettings()
      .then((s) => {
        setAutoplayEnabled(s.autoplayEnabled);
        setTransitionTimeout(s.autoplayTimeout);
        // Hydrate saved volume/speed from device cookies like song practice
        // does — otherwise a fresh load silently plays at store defaults
        // until a slider is touched.
        setVolume(readDeviceVolumeClient());
        setSpeed(readDeviceSpeedClient());
      })
      .catch(() => {})
      .finally(() => {
        if (!sessionStarted && countdown === null && !finished) {
          startCountdown();
        }
      });
    return () => {
      clearSkipOverlayTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist volume/speed changes to device cookies (skip-first: hydration
  // above sets the store from the same cookies).
  const mediaPersistSkipRef = useRef(true);
  useEffect(() => {
    if (mediaPersistSkipRef.current) {
      mediaPersistSkipRef.current = false;
      return;
    }
    writeDeviceVolume(volume);
    writeDeviceSpeed(speed);
  }, [volume, speed]);

  // Countdown ticker
  useEffect(() => {
    if (countdown === null || countdownPaused) return;
    if (countdown <= 0) {
      if (!sessionStarted) {
        startSession();
      } else {
        skipCountdown(queue.length);
      }
      return;
    }
    const t = setTimeout(() => tickCountdown(), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, countdownPaused, sessionStarted, currentIndex, queue.length]);

  const currentSong = queue[currentIndex]?.song;
  // The role group matching the requested instrument (covers only).
  const preferredRoleGroup = useMemo(
    () =>
      currentSong && currentSong.songType === "cover"
        ? currentSong.roleGroups.find(
            (rg) =>
              rg.role !== "Other" &&
              rg.role.toLowerCase() === instrumentPreference.toLowerCase()
          )
        : undefined,
    [currentSong, instrumentPreference]
  );
  // Role groups whose lazy lookup failed (rate limit, network) — they stop
  // counting as "searching" so the ladder fallback / no-video path resumes.
  const [lazyFailedIds, setLazyFailedIds] = useState<Set<string>>(new Set());
  // True when the requested instrument's group exists but its media still
  // needs a first-time lookup (null links = never searched, vs 'none'
  // sentinel = searched with no results). Computable during render, so the
  // spinner can appear before the fetch effect has run — no overlay flash.
  const preferredUncached = useMemo(
    () =>
      !!preferredRoleGroup &&
      preferredRoleGroup.backingCustomTrackId === null &&
      preferredRoleGroup.tabCustomTrackId === null &&
      !getYouTubeId(preferredRoleGroup.backingTrackLink) &&
      !getYouTubeId(preferredRoleGroup.tabVideoLink) &&
      (preferredRoleGroup.backingTrackLink === null ||
        preferredRoleGroup.tabVideoLink === null),
    [preferredRoleGroup]
  );
  // Memoized so useAutoplayEngine's internal memos (renderMedia, mute/solo
  // wiring) don't churn on every render — without this, the 60fps multitrack
  // tick re-renders the entire autoplay tree each frame.
  const backingMedia = useMemo(() => {
    const resolved = currentSong
      ? resolveBackingMedia(currentSong, instrumentPreference, progressMap[currentSong.id])
      : { kind: 'none' as const };
    // Single-practice parity: if the requested instrument's own role group
    // exists but has no usable media yet, don't silently fall back to another
    // instrument's cached video — surface the missing-media path instead
    // (loading spinner while the lookup runs, ladder fallback on failure).
    if (preferredRoleGroup && preferredUncached && !lazyFailedIds.has(preferredRoleGroup.id)) {
      return { kind: 'none' as const };
    }
    return resolved;
  }, [currentSong, instrumentPreference, progressMap, preferredRoleGroup, preferredUncached, lazyFailedIds]);
  const customTrack = backingMedia.kind === 'custom-file'
    ? currentSong?.customTracks?.find((t) => t.id === backingMedia.customTrackId)
    : undefined;
  const coverArtUrl = currentSong ? getCoverArtUrl(currentSong) : null;
  const upcomingSong = !sessionStarted ? currentSong : queue[currentIndex + 1]?.song;

  // Lazy-fill uncached cover media: preferred instrument's role group first,
  // then remaining groups one at a time. Mirrors detail-page/single-practice
  // behavior so uncached songs play instead of being skipped.
  const [lazyLoadingRoleId, setLazyLoadingRoleId] = useState<string | null>(null);
  const lazyInflightRef = useRef<string | null>(null);
  const lazyAttemptedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!currentSong || currentSong.songType !== "cover") return;
    if (lazyInflightRef.current) return;
    const standard = currentSong.roleGroups.filter((rg) => rg.role !== "Other");
    const preferred = standard.find(
      (rg) => rg.role.toLowerCase() === instrumentPreference.toLowerCase()
    );
    const ordered = preferred
      ? [preferred, ...standard.filter((g) => g.id !== preferred.id)]
      : standard;
    const next = ordered.find(
      (rg) =>
        !lazyAttemptedRef.current.has(rg.id) &&
        (rg.backingTrackLink === null || rg.tabVideoLink === null)
    );
    if (!next) return;
    lazyInflightRef.current = next.id;
    setLazyLoadingRoleId(next.id);
    lazyLoadTrackMedia(next.id)
      .then((res) => {
        if (!res.success) {
          // e.g. rate-limited: stop showing the spinner; retried on the next
          // song/instrument trigger (not added to lazyAttemptedRef).
          setLazyFailedIds((prev) => new Set(prev).add(next.id));
          return;
        }
        lazyAttemptedRef.current.add(next.id);
        return getSongDetails(currentSong.id).then((updated) => {
          if (updated) {
            setSongOverrides((prev) => ({ ...prev, [updated.id]: updated }));
          }
        });
      })
      .catch((err) => {
        console.error("Lazy media load failed:", err);
        setLazyFailedIds((prev) => new Set(prev).add(next.id));
      })
      .finally(() => {
        lazyInflightRef.current = null;
        setLazyLoadingRoleId(null);
      });
  }, [currentSong, instrumentPreference]);

  const isLazyLoading = lazyLoadingRoleId !== null;
  // Render-time derivation: true the instant the requested instrument's media
  // is missing-but-fetchable, even before the fetch effect has run — prevents
  // a one-frame flash of the "No Backing Track Found" overlay.
  const preferredSearching =
    preferredUncached &&
    !!preferredRoleGroup &&
    !lazyFailedIds.has(preferredRoleGroup.id);
  const isMediaSearching = isLazyLoading || preferredSearching;
  const loadingRg = currentSong?.roleGroups.find((g) => g.id === lazyLoadingRoleId);
  const lazyLoadingText = !loadingRg
    ? "Searching YouTube..."
    : loadingRg.backingTrackLink === null
      ? "Searching YouTube backing track..."
      : loadingRg.role === "Vocals"
        ? "Searching original song..."
        : "Searching YouTube lesson...";

  // No-video path: 4s timer then advance
  useEffect(() => {
    if (!sessionStarted || finished) return;
    if (isMediaSearching) return; // don't force-skip while searching for media
    if (backingMedia.kind !== "none" || skipReason !== "no_video") return;
    const t = setTimeout(() => {
      // treat as ended
      if (currentIndex >= queue.length - 1) {
        finish();
      } else if (usePlayerStore.getState().autoplayEnabled) {
        startCountdown();
      } else {
        setPlaying(false);
      }
    }, NO_VIDEO_SKIP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStarted, finished, backingMedia.kind, skipReason, currentIndex, queue.length, isMediaSearching]);

  // Detect no-video on song change once session started. skipReason is a dep:
  // when the countdown advances to the next (also media-less) song it resets
  // skipReason to null without changing backingMedia.kind — without this dep
  // the re-trigger never fires and the session stalls on the overlay.
  useEffect(() => {
    if (!sessionStarted || finished) return;
    if (backingMedia.kind === "none" && skipReason !== "no_video" && !isMediaSearching) {
      triggerNoVideo();
    } else if ((backingMedia.kind !== "none" || isMediaSearching) && skipReason === "no_video") {
      clearSkipReason();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backingMedia.kind, sessionStarted, skipReason, isMediaSearching]);

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
    onJumpToStart: () => {
      const off =
        backingMedia.kind === "youtube" || backingMedia.kind === "custom-file"
          ? backingMedia.offset
          : 0;
      autoplaySeekTo(off);
    },
  });

  useIframeFocusGuard();

  // Reset store on unmount
  useEffect(() => {
    return () => {
      reset();
      clearSkipOverlayTimer();
    };
  }, [reset, clearSkipOverlayTimer]);

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
    const prev = autoplayEnabled;
    setAutoplayEnabled(val);
    try {
      const res = await saveUserSettings({ autoplayEnabled: val });
      if (!res.success) throw new Error(res.error);
      toast.success(`Autoplay next song ${val ? "enabled" : "disabled"}`);
    } catch (err) {
      console.error(err);
      setAutoplayEnabled(prev);
      toast.error("Failed to save autoplay setting");
    }
  };

  const handleTimeoutChange = async (val: number) => {
    const prev = transitionTimeout;
    setTransitionTimeout(val);
    try {
      const res = await saveUserSettings({ autoplayTimeout: val, autoplayEnabled });
      if (!res.success) throw new Error(res.error);
    } catch (err) {
      console.error(err);
      setTransitionTimeout(prev);
      toast.error("Failed to save transition timer");
    }
  };

  // Circular countdown
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const totalForRing = transitionTimeout || 1;
  const dashOffset = circumference - ((countdown ?? 0) / totalForRing) * circumference;

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      <header className="flex flex-col gap-3 min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:items-center border-b border-border bg-card/40 px-4 md:px-6 py-4 flex-shrink-0 w-full">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            onClick={onExit}
            className="text-muted-foreground hover:text-foreground rounded-xl border border-border bg-card/40 h-10 px-3 flex items-center gap-1.5 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit Practice Mode
          </Button>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground truncate">{rehearsal.title}</h2>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                <ClientDate ms={rehearsal.date} variant="date" />
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center flex-shrink-0 self-start min-[400px]:self-auto min-[400px]:ml-auto">
          <PrivateIndicator
            text="Settings synced only for you"
            tooltip="All settings, offsets, markers, and autoplay preferences are private to your account."
          />
        </div>
      </header>

      <div className="flex flex-col">
        {/* Player */}
        <div className="flex flex-col bg-background/60">
          <div className="w-full max-w-4xl mx-auto flex flex-col gap-4 py-6 px-4">
            <div
              className="w-full aspect-video bg-black border border-border rounded-2xl overflow-hidden relative shadow-2xl shadow-black/90 flex-shrink-0"
              onMouseLeave={blurActiveIframe}
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
                          className="stroke-muted"
                          strokeWidth="5"
                          fill="transparent"
                        />
                        <circle
                          cx="48"
                          cy="48"
                          r={radius}
                          className="stroke-primary"
                          strokeWidth="5"
                          fill="transparent"
                          strokeDasharray={circumference}
                          strokeDashoffset={dashOffset}
                        />
                      </svg>
                      <span className="absolute text-2xl font-heading font-bold text-accent-text">{countdown}</span>
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-base font-heading font-bold text-foreground leading-snug line-clamp-1">
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
                        className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-heading font-bold px-4 h-9 animate-none"
                      >
                        {!sessionStarted ? "Start Now" : "Play Now"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* No-video overlay (or first-time media search indicator) */}
              {backingMedia.kind === "none" && countdown === null && !finished && currentSong && sessionStarted && (
                isMediaSearching ? (
                  <div className="absolute inset-0 z-20 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                    <div className="flex flex-col items-center justify-center py-8">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mb-2" />
                      <p className="text-xs text-muted-foreground">{lazyLoadingText}</p>
                    </div>
                  </div>
                ) : (
                <div className="absolute inset-0 z-20 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                  <div className="space-y-3 max-w-md flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-destructive/10 border border-destructive/40 flex items-center justify-center text-destructive mb-2">
                      <Music className="w-6 h-6" />
                    </div>
                    <h3 className="text-sm font-bold text-destructive">No Backing Track Found</h3>
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
                )
              )}

              {/* Finished overlay */}
              {finished && (
                <div className="absolute inset-0 z-30 bg-background/98 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
                  <div className="space-y-4 max-w-sm flex flex-col items-center">
                    <div className="w-14 h-14 rounded-full bg-success/10 border border-success/40 flex items-center justify-center text-success mb-2">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-lg font-heading font-bold text-foreground">Rehearsal Prep Complete!</h3>
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
                        className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl text-xs font-heading font-bold px-4 h-10 animate-none"
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
                  <h3 className="text-lg font-heading font-bold text-foreground mt-1 truncate">
                    {currentSong.title}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    by {currentSong.artist}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {currentSong && (
                    <TuningBadges
                      song={currentSong}
                      highlightRole={instrumentPreference}
                      variant="solid"
                      className="text-[8px]"
                    />
                  )}

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
                      className="h-9 w-9 border-border bg-background/40 hover:bg-muted text-accent-text hover:text-accent-text-strong rounded-lg flex items-center justify-center cursor-pointer"
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
        <div className="w-full border-t border-border bg-card/10 flex flex-col">
          <div className="p-4 border-b border-border space-y-4 flex-shrink-0 bg-card/40">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Practice Instrument
              </span>
              <Tabs
                value={instrumentPreference}
                onValueChange={handleInstrumentChange}
                className="w-full"
              >
                <TabsList className="bg-background border border-border p-0.5 rounded-xl h-auto flex w-full">
                  {INSTRUMENT_ROLES.filter((r) => r !== "Other").map((inst) => (
                    <TabsTrigger
                      key={inst}
                      value={inst}
                      className="px-1 py-1 text-[10px] font-bold rounded-lg data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground hover:text-foreground transition-all cursor-pointer flex-1 text-center"
                    >
                      {ROLE_LABEL[inst]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Auto-advance
                </span>
                <div className="flex bg-background/60 p-1 border border-border rounded-xl gap-1 w-full justify-between">
                  <Button
                    onClick={() => handleAutoplayEnabledChange(true)}
                    className={cn(
                      "text-xs font-bold px-3 py-1 h-7 rounded-lg transition-all border-0 flex-1 cursor-pointer animate-none",
                      autoplayEnabled
                        ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
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
                        ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
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
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Volume
                  </span>
                  <span className="text-[10px] font-mono text-accent-text font-bold">{volume}%</span>
                </div>
                <div className="flex items-center bg-background/60 border border-border px-3.5 py-2 rounded-xl gap-3">
                  <button
                    onClick={() => setVolume(volume === 0 ? 100 : 0)}
                    aria-label={volume === 0 ? "Unmute" : "Mute"}
                    title={volume === 0 ? "Unmute" : "Mute"}
                    className="text-accent-text hover:text-accent-text-strong transition-colors cursor-pointer border-0 bg-transparent p-2 -m-2 rounded-md flex items-center"
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
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Playback Speed
                  </span>
                  <span className="text-[10px] font-mono text-accent-text font-bold">
                    {speed.toFixed(2)}x
                  </span>
                </div>
                <div className="flex items-center bg-background/60 border border-border px-3.5 py-2 rounded-xl gap-3">
                  <span className="text-accent-text flex items-center">
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

          <div className="p-3 space-y-2.5">
            {queue.map((rs, index) => {
              const isSongActive = index === currentIndex;
              const isSongCompleted = index < currentIndex;
              const isSongNext = index === currentIndex + 1;
              return (
                <button
                  type="button"
                  key={rs.songId}
                  onClick={() => setCurrentIndex(index)}
                  className={cn(
                    "w-full text-left flex flex-col p-3 rounded-xl border transition-all duration-200 cursor-pointer select-none gap-2",
                    isSongActive
                      ? "bg-muted border-ring/45 shadow-md shadow-black/20"
                      : isSongCompleted
                        ? "bg-background/20 border-border/60 opacity-60 hover:opacity-90 hover:border-ring/30"
                        : "bg-background/40 border-border/80 hover:bg-card/40 hover:border-ring/30"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <span className="text-xs font-mono font-bold text-muted-foreground w-5 text-right flex-shrink-0">
                        {index + 1}.
                      </span>
                      {(() => {
                        const art = getCoverArtUrl(rs.song);
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
                        <span
                          className={cn(
                            "block text-xs font-bold truncate",
                            isSongActive ? "text-foreground" : "text-foreground/90"
                          )}
                        >
                          {rs.song.title}
                        </span>
                        <span className="block text-[10px] text-muted-foreground truncate mt-0.5 font-medium">
                          {rs.song.artist}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center flex-shrink-0">
                      {isSongCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      ) : isSongActive ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_var(--primary)]" />
                      ) : isSongNext ? (
                        <Clock className="w-4 h-4 text-muted-foreground" />
                      ) : null}
                    </div>
                  </div>

                  <TuningBadges
                    song={rs.song}
                    highlightRole={instrumentPreference}
                    size="xs"
                    className="gap-1.5 pl-8 mt-0.5"
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
