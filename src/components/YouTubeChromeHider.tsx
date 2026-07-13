"use client";

import { useEffect, useState } from "react";

/**
 * Covers YouTube's persistent UI elements (title, share, logo, center play
 * button, volume chip) that cannot be removed via player parameters.
 * `showinfo` was deprecated 2018; `modestbranding` deprecated Aug 2023.
 *
 * Renders opaque overlays at z-10 (between the YT iframe and the custom HUD
 * at z-20). When playing, overlays are hidden — `controls=0` suppresses
 * most YT chrome during playback. When paused, overlays cover YT's UI so
 * the video frame remains visible for study without YT's chrome showing.
 *
 * ponytail: snapshotting the paused frame is impossible — the YT iframe is
 * cross-origin, canvas.drawImage throws SecurityError. Keeping the iframe
 * visible with targeted opaque overlays is the simplest way to preserve the
 * frame while hiding YT's chrome.
 */
export function YouTubeChromeHider({ isPlaying }: { isPlaying: boolean }) {
  // Delay hiding overlays briefly after play starts so YT's center button
  // (which lingers until the video actually renders) stays covered.
  const [hide, setHide] = useState(false);

  useEffect(() => {
    if (isPlaying) {
      const t = setTimeout(() => setHide(true), 400);
      return () => clearTimeout(t);
    }
    setHide(false);
  }, [isPlaying]);

  if (hide) return null;

  return (
    <div className="absolute inset-0 z-10 overflow-hidden pointer-events-none">
      {/* Center: cover YT's play/pause button. The custom HUD's own center
          button (z-20, w-16 h-16) sits on top, unchanged. This circle is
          slightly larger (w-20) to cover YT's semi-transparent backdrop. */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-black pointer-events-auto" />

      {/* Top: cover title + channel name (top-left) + share menu (top-right) */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black via-black/85 to-transparent pointer-events-auto" />

      {/* Bottom-right: cover YouTube logo */}
      <div className="absolute bottom-0 right-0 w-36 h-14 bg-gradient-to-tl from-black via-black/80 to-transparent pointer-events-auto" />

      {/* Bottom-left: cover volume/hover chip (replaces phantom divs) */}
      <div className="absolute bottom-0 left-0 w-24 h-12 bg-gradient-to-tr from-black via-black/80 to-transparent pointer-events-auto" />
    </div>
  );
}
