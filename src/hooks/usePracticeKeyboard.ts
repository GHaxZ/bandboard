"use client";

import { useEffect, useRef } from "react";

interface PracticeKeyboardConfig {
  /** Context-specific Tab action; takes priority over focus navigation. */
  onTab?: () => void;
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
      if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;

      // Tab runs the current surface's action regardless of focus. Without
      // a handler (editor, single-feed covers), retain normal navigation.
      if (e.key === "Tab") {
        if (configRef.current.onTab) {
          e.preventDefault();
          e.stopPropagation();
          configRef.current.onTab();
        }
        return;
      }

      // Number shortcuts, like Tab, take priority regardless of focus.
      if (e.key === "0") {
        if (configRef.current.onJumpToStart) {
          e.preventDefault();
          e.stopPropagation();
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
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);
}
