"use client";

import { useEffect, useRef } from "react";

interface PracticeKeyboardConfig {
  onToggleVideo?: () => void;
  onPlayPause?: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
  onMarkerJump?: (index: number) => void;
}

/** Global keyboard shortcuts for the player surfaces (PLAN §9.6). */
export function usePracticeKeyboard(config: PracticeKeyboardConfig) {
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const tag = active?.tagName;
      // Skip when focus is inside a form control (Tab still switches video
      // everywhere else — this is the intended "at all times" behavior).
      if (
        active &&
        (tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          (active as HTMLElement)?.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Tab") {
        if (configRef.current.onToggleVideo) {
          e.preventDefault();
          e.stopPropagation();
          configRef.current.onToggleVideo();
        }
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
