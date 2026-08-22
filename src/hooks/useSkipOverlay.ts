"use client";

import { useState, useRef, useCallback } from "react";

export type SkipOverlay = { type: "back" | "forward"; key: number } | null;

/** Transient "+5s/-5s" seek indicator, shared by practice shell + autoplay. */
export function useSkipOverlay(durationMs = 600) {
  const [skipOverlay, setSkipOverlay] = useState<SkipOverlay>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSkipOverlay = useCallback(
    (type: "back" | "forward") => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setSkipOverlay({ type, key: Date.now() });
      timeoutRef.current = setTimeout(() => setSkipOverlay(null), durationMs);
    },
    [durationMs]
  );

  const clearSkipOverlayTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  return { skipOverlay, triggerSkipOverlay, clearSkipOverlayTimer };
}
