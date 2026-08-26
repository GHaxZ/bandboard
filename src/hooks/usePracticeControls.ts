"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayerStore } from "@/stores/player-store";
import { savePracticeMarkers } from "@/app/actions/user";
import { writeDeviceVolume, writeDeviceSpeed } from "@/lib/device-media";
import { MAX_MARKERS } from "@/lib/constants";
import { toast } from "sonner";

interface UsePracticeControlsOpts {
  songId: string;
  initialVolume: number;
  initialSpeed: number;
  initialMarkers: number[];
  /** Used by handleSaveCurrentTimeAsMarker to capture the player's current
   * time. Caller passes the engine's `getActiveCurrentTime`. */
  getCurrentTime: () => number;
  onRefresh: () => void;
}

interface UsePracticeControlsResult {
  volume: number;
  setVolume: (v: number) => void;
  speed: number;
  setSpeed: (s: number) => void;
  markers: number[];
  handleSaveMarker: (newTime: number) => Promise<void>;
  handleSaveCurrentTimeAsMarker: () => Promise<void>;
  handleDeleteMarker: (indexToDelete: number) => Promise<void>;
}

/**
 * Shared volume/speed/marker logic for practice surfaces (Phase 4 of the
 * cover/original rework) so cover and original practice modes behave
 * identically for these concerns.
 *
 * - Hydrates the store's `volume`/`speed`/`markers` once on mount from the
 *   caller-supplied initial values.
 * - Persists subsequent volume/speed slider changes to device cookies.
 * - Exposes marker add/delete handlers that save to `savePracticeMarkers`.
 */
export function usePracticeControls(
  opts: UsePracticeControlsOpts
): UsePracticeControlsResult {
  const { songId, initialVolume, initialSpeed, initialMarkers, getCurrentTime, onRefresh } = opts;
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const speed = usePlayerStore((s) => s.speed);
  const setSpeed = usePlayerStore((s) => s.setSpeed);
  const markers = usePlayerStore((s) => s.markers);
  const setMarkers = usePlayerStore((s) => s.setMarkers);

  // Hydrate store from initial values once on mount.
  const hydratedRef = useRef(false);
  useEffect(() => {
    setVolume(initialVolume);
    setSpeed(initialSpeed);
    setMarkers([...initialMarkers].sort((a, b) => a - b));
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced persistence of volume / speed to device cookies. Skip the
  // first run per setting: the hydration effect above sets hydratedRef in the
  // same commit, so without a skip the mount would schedule a redundant
  // cookie write 500ms after every practice mount. The pending value is
  // flushed on unmount so a change made <500ms before exiting isn't dropped.
  const volumeSkipFirst = useRef(true);
  const pendingVolumeRef = useRef<number | null>(null);
  useEffect(() => {
    if (volumeSkipFirst.current) {
      volumeSkipFirst.current = false;
      return;
    }
    if (!hydratedRef.current) return;
    pendingVolumeRef.current = volume;
    const t = setTimeout(() => {
      pendingVolumeRef.current = null;
      writeDeviceVolume(volume);
    }, 500);
    return () => clearTimeout(t);
  }, [volume]);
  useEffect(() => {
    return () => {
      if (pendingVolumeRef.current !== null) {
        writeDeviceVolume(pendingVolumeRef.current);
      }
    };
  }, []);

  const speedSkipFirst = useRef(true);
  const pendingSpeedRef = useRef<number | null>(null);
  useEffect(() => {
    if (speedSkipFirst.current) {
      speedSkipFirst.current = false;
      return;
    }
    if (!hydratedRef.current) return;
    pendingSpeedRef.current = speed;
    const t = setTimeout(() => {
      pendingSpeedRef.current = null;
      writeDeviceSpeed(speed);
    }, 500);
    return () => clearTimeout(t);
  }, [speed]);
  useEffect(() => {
    return () => {
      if (pendingSpeedRef.current !== null) {
        writeDeviceSpeed(pendingSpeedRef.current);
      }
    };
  }, []);

  const handleSaveMarker = useCallback(
    async (newTime: number) => {
      if (markers.length >= MAX_MARKERS) {
        toast.error(
          `You can only save up to ${MAX_MARKERS} practice markers. Please delete an existing one to add a new marker.`
        );
        return;
      }
      const updated = Array.from(new Set([...markers, newTime])).sort(
        (a, b) => a - b
      );
      try {
        await savePracticeMarkers(songId, updated);
        // Only reflect in the store after the save succeeded — a failed save
        // must not leave a phantom marker that vanishes on next hydration.
        setMarkers(updated);
        toast.success("Marker saved successfully!");
        onRefresh();
      } catch (err) {
        console.error(err);
        toast.error("Failed to save marker: " + String(err));
      }
    },
    [markers, setMarkers, songId, onRefresh]
  );

  const handleSaveCurrentTimeAsMarker = useCallback(async () => {
    const t = getCurrentTime();
    if (typeof t === "number" && !isNaN(t)) {
      await handleSaveMarker(Math.round(t * 1000) / 1000);
    }
  }, [getCurrentTime, handleSaveMarker]);

  const handleDeleteMarker = useCallback(
    async (indexToDelete: number) => {
      const updated = markers.filter((_, idx) => idx !== indexToDelete);
      try {
        await savePracticeMarkers(songId, updated);
        // Apply only after the save succeeded — otherwise a failed delete
        // would drop the marker from the UI while the DB still has it.
        setMarkers(updated);
        onRefresh();
      } catch (err) {
        console.error(err);
        // Don't leave the user with a silently-dropped marker — it would
        // reappear on reload.
        toast.error("Failed to delete marker: " + String(err));
      }
    },
    [markers, setMarkers, songId, onRefresh]
  );

  return {
    volume,
    setVolume,
    speed,
    setSpeed,
    markers,
    handleSaveMarker,
    handleSaveCurrentTimeAsMarker,
    handleDeleteMarker,
  };
}