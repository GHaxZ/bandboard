"use client";

import { Music } from "lucide-react";
import type { CustomTrack } from "@/types/models";

interface StemMediaPoolProps {
  tracks: CustomTrack[];
  previewTrack: CustomTrack | null;
  coverArtUrl?: string | null;
  registerRef: (trackId: string) => (el: HTMLMediaElement | null) => void;
  fallbackText: string;
}

/** Preview video + hidden media pool for multistem playback. Shared by the
 *  multistem practice engine and the rehearsal autoplay engine (the two used
 *  to carry near-identical copies of this subtree). */
export function StemMediaPool({
  tracks,
  previewTrack,
  coverArtUrl,
  registerRef,
  fallbackText,
}: StemMediaPoolProps) {
  return (
    <>
      {previewTrack ? (
        <video
          key={previewTrack.id}
          ref={registerRef(previewTrack.id)}
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
          <Music className="w-12 h-12 mx-auto mb-2 text-[#27282b] animate-pulse" />
          <p className="text-sm font-semibold text-foreground">{fallbackText}</p>
        </div>
      )}

      <div className="hidden">
        {tracks
          .filter((t) => t.id !== previewTrack?.id)
          .map((track) =>
            track.isVideo ? (
              <video
                key={track.id}
                ref={registerRef(track.id)}
                src={`/api/uploads/${track.id}`}
                preload="metadata"
                playsInline
              />
            ) : (
              <audio
                key={track.id}
                ref={registerRef(track.id)}
                src={`/api/uploads/${track.id}`}
                preload="metadata"
              />
            )
          )}
      </div>
    </>
  );
}
