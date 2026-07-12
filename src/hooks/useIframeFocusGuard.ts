"use client";

import { useEffect } from "react";

/**
 * Restore window focus after the user clicks inside a YouTube iframe so the
 * page-level keyboard shortcuts (usePracticeKeyboard) keep firing. We blur the
 * iframe and re-focus the window on every blur; we do NOT dispatch a synthetic
 * Tab keydown — video switching is handled only by the Tab key and the UI
 * toggle buttons (PLAN §3.3).
 */
export function useIframeFocusGuard() {
  useEffect(() => {
    const handleBlur = () => {
      setTimeout(() => {
        const active = document.activeElement;
        if (active && active.tagName === "IFRAME") {
          try {
            (active as HTMLElement).blur();
          } catch {
            // ignore
          }
          window.focus();
        }
      }, 50);
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, []);
}