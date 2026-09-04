"use client";

import { useEffect, useRef } from "react";

/**
 * Blur a focused YouTube iframe and restore window focus. Shared by the blur
 * listener below and the onMouseLeave handlers on the player surfaces — both
 * exist so page-level keyboard shortcuts (usePracticeKeyboard) keep firing
 * after the user interacts with an embed.
 */
export function blurActiveIframe() {
  const active = document.activeElement;
  if (active && active.tagName === "IFRAME") {
    try {
      (active as HTMLElement).blur();
    } catch {
      // ignore
    }
    window.focus();
  }
}

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
      // Clear any pending timeout first — rapid successive blurs would
      // otherwise stack timers.
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      // Immediate attempt (activeElement is usually already the iframe) plus
      // a delayed retry for browsers that update activeElement after the
      // blur event — shrinks the window where keys silently go to the iframe.
      blurActiveIframe();
      timeoutRef.current = setTimeout(blurActiveIframe, 50);
    };

    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("blur", handleBlur);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
}
