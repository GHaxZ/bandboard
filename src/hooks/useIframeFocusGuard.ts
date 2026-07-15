"use client";

import { useEffect, useRef } from "react";

/**
 * Restore window focus after the user clicks inside a YouTube iframe so the
 * page-level keyboard shortcuts (usePracticeKeyboard) keep firing. We blur the
 * iframe and re-focus the window on every blur; we do NOT dispatch a synthetic
 * Tab keydown — video switching is handled only by the Tab key and the UI
 * toggle buttons (PLAN §3.3).
 */
export function useIframeFocusGuard() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleBlur = () => {
      timeoutRef.current = setTimeout(() => {
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
    return () => {
      window.removeEventListener("blur", handleBlur);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
}
