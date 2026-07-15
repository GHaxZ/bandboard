import {
  AUTOPLAY_TIMEOUT_MIN,
  AUTOPLAY_TIMEOUT_MAX,
  SPEED_MIN,
  SPEED_MAX,
  MAX_MARKERS,
  PROGRESS_STATUSES,
} from './constants';

// ---------------------------------------------------------------------------
// Clamp helpers
// ---------------------------------------------------------------------------
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function clampVolume(v: number): number {
  return clamp(Math.round(v), 0, 100);
}

export function clampPlaybackSpeed(v: number): number {
  return clamp(v, SPEED_MIN / 100, SPEED_MAX / 100);
}

export function clampAutoplayTimeout(v: number): number {
  return clamp(Math.round(v), AUTOPLAY_TIMEOUT_MIN, AUTOPLAY_TIMEOUT_MAX);
}

// ---------------------------------------------------------------------------
// Validators — return null on success, error string on failure
// ---------------------------------------------------------------------------
export function validateUserSettings(s: Record<string, unknown>): string | null {
  if (s.volume !== undefined && (typeof s.volume !== 'number' || Number.isNaN(s.volume))) {
    return 'volume must be a number';
  }
  if (s.playbackSpeed !== undefined && (typeof s.playbackSpeed !== 'number' || Number.isNaN(s.playbackSpeed))) {
    return 'playbackSpeed must be a number';
  }
  if (s.autoplayTimeout !== undefined && (typeof s.autoplayTimeout !== 'number' || Number.isNaN(s.autoplayTimeout))) {
    return 'autoplayTimeout must be a number';
  }
  return null;
}

export function validateSongProgress(p: Record<string, unknown>): string | null {
  if (p.status !== undefined) {
    const valid = PROGRESS_STATUSES.map((s) => s.id);
    if (!(valid as string[]).includes(p.status as string)) return `status must be one of: ${valid.join(', ')}`;
  }
  if (p.speed !== undefined && (typeof p.speed !== 'number' || p.speed < SPEED_MIN || p.speed > SPEED_MAX)) {
    return `speed must be between ${SPEED_MIN} and ${SPEED_MAX}`;
  }
  return null;
}

export function validatePracticeMarkers(markers: unknown): string | null {
  if (!Array.isArray(markers)) return 'markers must be an array';
  if (markers.length > MAX_MARKERS) return `at most ${MAX_MARKERS} markers allowed`;
  if (!markers.every((m) => typeof m === 'number' && Number.isFinite(m))) {
    return 'each marker must be a finite number';
  }
  return null;
}

export function validateStartOffsets(o: Record<string, unknown>): string | null {
  if (o.backing !== undefined && (typeof o.backing !== 'number' || !Number.isFinite(o.backing))) {
    return 'backing offset must be a finite number';
  }
  if (o.tab !== undefined && (typeof o.tab !== 'number' || !Number.isFinite(o.tab))) {
    return 'tab offset must be a finite number';
  }
  return null;
}

export function validateRehearsal(r: Record<string, unknown>): string | null {
  if (r.title !== undefined && (typeof r.title !== 'string' || !r.title.trim())) {
    return 'title is required';
  }
  if (r.date !== undefined && (typeof r.date !== 'number' || !Number.isInteger(r.date))) {
    return 'date must be an integer (Unix ms)';
  }
  return null;
}
