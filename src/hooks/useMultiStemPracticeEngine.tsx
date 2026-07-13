"use client";

import { useState, useEffect, useMemo } from "react";
import { useMultiTrackPlayer } from "./useMultiTrackPlayer";
import { usePlayerStore } from "@/stores/player-store";
import { cn } from "@/lib/utils";
import { INSTRUMENT_ROLES } from "@/lib/constants";
import type { PlaybackEngine } from "@/lib/media-controller";
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
  hasCustomMedia: boolean;
}

export function useMultiStemPracticeEngine({
  tracks,
  preferredInstrument,
  coverArtUrl,
}: UseMultiStemPracticeEngineOpts): UseMultiStemPracticeEngineResult {
  const [activeRole, setActiveRole] = useState<Role>(preferredInstrument);
  const [videoPreviewId, setVideoPreviewId] = useState<string | null>(null);

  const reset = usePlayerStore((s) => s.reset);

  const mutedTrackIds = useMemo(
    () => new Set(tracks.filter((t) => t.role === activeRole).map((t) => t.id)),
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
    reset();
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const player = useMultiTrackPlayer({
    tracks,
    mutedTrackIds,
    soloTrackIds: new Set(),
    getStreamUrl: (id) => `/api/uploads/${id}`,
  });

  const engine: PlaybackEngine = useMemo(
    () => ({
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
    }),
    [player]
  );

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
    hasCustomMedia: true,
    mediaSurface: (
      <>
        {previewTrack ? (
          <video
            key={previewTrack.id}
            ref={player.registerRef(previewTrack.id)}
            src={`/api/uploads/${previewTrack.id}`}
            className="w-full h-full object-contain"
            preload="metadata"
            playsInline
          />
        ) : coverArtUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverArtUrl} alt="" className="w-full h-full object-contain" />
        ) : (
          <div className="text-center p-6 text-muted-foreground">
            <MusicIcon className="w-12 h-12 mx-auto mb-2 text-[#27282b] animate-pulse" />
            <p className="text-sm font-semibold text-foreground">
              No playback video
            </p>
          </div>
        )}

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

        <div className="hidden">
          {tracks
            .filter((t) => t.id !== videoPreviewId)
            .map((track) =>
              track.isVideo ? (
                <video
                  key={track.id}
                  ref={player.registerRef(track.id)}
                  src={`/api/uploads/${track.id}`}
                  preload="metadata"
                  playsInline
                />
              ) : (
                <audio
                  key={track.id}
                  ref={player.registerRef(track.id)}
                  src={`/api/uploads/${track.id}`}
                  preload="metadata"
                />
              )
            )}
        </div>
      </>
    ),
  };
}

function MusicIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}
