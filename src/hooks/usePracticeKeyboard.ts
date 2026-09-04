"use client";

import { useEffect, useRef } from "react";

interface PracticeKeyboardConfig {
  onToggleVideo?: () => void;
  onPlayPause?: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
  onMarkerJump?: (index: number) => void;
  onJumpToStart?: () => void;
}

/** Global keyboard shortcuts for the player surfaces (PLAN §9.6). */
export function usePracticeKeyboard(config: PracticeKeyboardConfig) {
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tab ALWAYS switches video when a toggle handler exists — regardless
      // of what is focused (buttons, sliders, inputs). Without a handler
      // (editor, single-feed covers, autoplay) Tab falls through to default.
      if (e.key === "Tab") {
        if (configRef.current.onToggleVideo) {
          e.preventDefault();
          e.stopPropagation();
          configRef.current.onToggleVideo();
        }
        return;
      }

      const active = document.activeElement;
      const tag = active?.tagName;
      // Exempt only text-entry surfaces for the remaining keys — typing there
      // must produce characters. Buttons/sliders/tab-triggers are deliberately
      // NOT exempt: after clicking any control, playback keys must still
      // respond (preventDefault also stops the focused control re-activating).
      if (
        active &&
        (tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          (active as HTMLElement)?.isContentEditable)
      ) {
        return;
      }

      if (e.key === " ") {
        if (configRef.current.onPlayPause) {
          e.preventDefault();
          e.stopPropagation();
          if (active && active !== document.body) {
            (active as HTMLElement).blur();
          }
          configRef.current.onPlayPause();
        }
        return;
      }
      if (e.key === "ArrowLeft") {
        if (configRef.current.onSeekBackward) {
          e.preventDefault();
          e.stopPropagation();
          if (active && active !== document.body) {
            (active as HTMLElement).blur();
          }
          configRef.current.onSeekBackward();
        }
        return;
      }
      if (e.key === "ArrowRight") {
        if (configRef.current.onSeekForward) {
          e.preventDefault();
          e.stopPropagation();
          if (active && active !== document.body) {
            (active as HTMLElement).blur();
          }
          configRef.current.onSeekForward();
        }
        return;
      }
      if (e.key === "0") {
        if (configRef.current.onJumpToStart) {
          e.preventDefault();
          e.stopPropagation();
          if (active && active !== document.body) {
            (active as HTMLElement).blur();
          }
          configRef.current.onJumpToStart();
        }
        return;
      }
      if (e.key >= "1" && e.key <= "9") {
        if (configRef.current.onMarkerJump) {
          e.preventDefault();
          e.stopPropagation();
          const index = parseInt(e.key, 10) - 1;
          configRef.current.onMarkerJump(index);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);
}
