"use client";

import { useEffect } from "react";
import { usePlayerStore } from "@/stores/player-store";

/**
 * Push the player store's volume/speed onto HTML media elements whenever they
 * change OR when the element instances are replaced (list the mirrored
 * elements in `deps` so replacements re-trigger application). Shared by every
 * surface that plays uploaded files through <audio>/<video> elements.
 */
export function useMediaStoreSync(
  getEls: () => Array<HTMLMediaElement | null | undefined>,
  deps: unknown[]
) {
  const volume = usePlayerStore((s) => s.volume);
  const speed = usePlayerStore((s) => s.speed);

  useEffect(() => {
    for (const el of getEls()) {
      if (el) el.volume = Math.max(0, Math.min(1, volume / 100));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volume, ...deps]);

  useEffect(() => {
    for (const el of getEls()) {
      if (el) el.playbackRate = speed;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, ...deps]);
}
