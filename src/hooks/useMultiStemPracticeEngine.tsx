"use client";

import { useState, useEffect, useMemo } from "react";
import { useMultiTrackPlayer } from "./useMultiTrackPlayer";
import { usePlayerStore } from "@/stores/player-store";
import { StemMediaPool } from "@/components/StemMediaPool";
import { cn } from "@/lib/utils";
import { INSTRUMENT_ROLES } from "@/lib/constants";
import type { PlaybackEngine } from "@/lib/media-controller";
import { trackIdsWithRole } from "@/types/models";
import type { CustomTrack } from "@/types/models";
import type { Role } from "@/lib/constants";

interface UseMultiStemPracticeEngineOpts {
  tracks: CustomTrack[];
  preferredInstrument: Role;
  coverArtUrl?: string | null;
}

interface UseMultiStemPracticeEngineResult {
  engine: PlaybackEngine;
  capabilities: { canToggle: false; hasOffsets: false };
  activeRole: Role;
  setActiveRole: (role: Role) => void;
  availableRoles: Role[];
  stemTracks: CustomTrack[];
  registerRef: (trackId: string) => (el: HTMLMediaElement | null) => void;
  mutedTrackIds: Set<string>;
  mediaSurface: React.ReactNode;
  hasMedia: boolean;
}

export function useMultiStemPracticeEngine({
  tracks,
  preferredInstrument,
  coverArtUrl,
}: UseMultiStemPracticeEngineOpts): UseMultiStemPracticeEngineResult {
  const [activeRole, setActiveRole] = useState<Role>(preferredInstrument);
  const [videoPreviewId, setVideoPreviewId] = useState<string | null>(null);

  // Re-sync active role when the preferred instrument changes (mirrors the
  // cover engine's behaviour; harmless today since the page remounts, but
  // keeps the two engines consistent).
  useEffect(() => {
    setActiveRole(preferredInstrument);
  }, [preferredInstrument]);

  const reset = usePlayerStore((s) => s.reset);

  const mutedTrackIds = useMemo(
    () => trackIdsWithRole(tracks, activeRole),
    [tracks, activeRole]
  );

  const availableRoles = useMemo(() => {
    const roleSet = new Set<string>();
    for (const t of tracks) roleSet.add(t.role);
    return INSTRUMENT_ROLES.filter((r) => roleSet.has(r));
  }, [tracks]);

  const videoTracks = useMemo(() => tracks.filter((t) => t.isVideo), [tracks]);

  useEffect(() => {
    if (videoTracks.length > 0 && !videoTracks.some((t) => t.id === videoPreviewId)) {
      setVideoPreviewId(videoTracks[0].id);
    }
  }, [videoTracks, videoPreviewId]);

  useEffect(() => {
    // Reset only on unmount, matching useCoverPracticeEngine: a mount-time
    // reset runs AFTER PracticeShell's marker hydration effect (child effects
    // run first) and wipes saved markers from the store.
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ponytail: practice mode always starts from zero — discard any startOffset.
  const player = useMultiTrackPlayer({
    tracks: tracks.map((t) => ({ ...t, startOffset: 0 })),
    mutedTrackIds,
    soloTrackIds: new Set(),
  });

  // No useMemo here: `player` is a fresh object every render, so a memo on it
  // would never memoize anyway — it only added indirection.
  const engine: PlaybackEngine = {
    playPause: () => player.playPause(),
    seekBy: (delta: number) => player.seekBy(delta),
    seekTo: (time: number) => player.seekTo(time),
    getCurrentTime: () => player.getCurrentT(),
    get duration() {
      return player.duration;
    },
    get isPlaying() {
      return usePlayerStore.getState().isPlaying;
    },
  };

  const previewTrack = videoTracks.find((t) => t.id === videoPreviewId) ?? null;

  return {
    engine,
    capabilities: { canToggle: false as const, hasOffsets: false as const },
    activeRole,
    setActiveRole,
    availableRoles,
    stemTracks: tracks,
    registerRef: player.registerRef,
    mutedTrackIds,
    hasMedia: true,
    mediaSurface: (
      <>
        <StemMediaPool
          tracks={tracks}
          previewTrack={previewTrack}
          coverArtUrl={coverArtUrl}
          registerRef={player.registerRef}
          fallbackText="No playback video"
        />

        {videoTracks.length > 1 && (
          <div className="absolute bottom-2 left-2 right-2 flex gap-1.5 overflow-x-auto bg-black/60 backdrop-blur-sm rounded-xl p-1.5">
            {videoTracks.map((vt) => (
              <button
                key={vt.id}
                onClick={() => setVideoPreviewId(vt.id)}
                className={cn(
                  "flex-shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer border",
                  vt.id === videoPreviewId
                    ? "bg-[#2e4057] border-[#2e4057] text-[#acd1f8]"
                    : "bg-transparent border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {vt.label}
              </button>
            ))}
          </div>
        )}
      </>
    ),
  };
}
