"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getSongProgress } from "@/app/actions/user";

export interface SongProgressState {
  status: string;
  speed: number;
  notes: string;
}

/**
 * Fetch the current user's progress for a song once on mount, with an explicit
 * `reload` for after-save refreshes. Shared by the cover and original song
 * dashboards (both previously duplicated this fetch + state + onSaveSuccess
 * refetch, and both pass the result to PracticeLogCard).
 */
export function useSongProgress(songId: string) {
  const [progress, setProgress] = useState<SongProgressState | null>(null);
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    if (!songId || !mountedRef.current) return;
    const prog = await getSongProgress(songId);
    if (!mountedRef.current) return;
    setProgress(
      prog
        ? { status: prog.status, speed: prog.speed, notes: prog.notes || "" }
        : { status: "not_started", speed: 100, notes: "" }
    );
  }, [songId]);

  useEffect(() => {
    mountedRef.current = true;
    void reload();
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  return { progress, reload };
}
