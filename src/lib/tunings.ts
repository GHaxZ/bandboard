import type { Song } from '@/types/models';

export interface TuningInfo {
  tuning: string;
  role: 'Guitar' | 'Bass';
}

const VALID_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
};

/** Normalize a single note: capitalize, lowercase 'b' (flat), convert flats to
 *  sharps to match the auto-fetched Songsterr convention. Returns null if invalid. */
export function normalizeNote(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Handle flat notation: "Eb" or "eb" or "EB" or "eB"
  let normalized = trimmed.charAt(0).toUpperCase();
  const rest = trimmed.slice(1);
  if (rest.toLowerCase() === 'b') {
    normalized += 'b';
  } else if (rest === '#') {
    normalized += '#';
  } else if (rest === '') {
    // single note letter, fine
  } else {
    return null;
  }
  if (VALID_NOTES.includes(normalized)) return normalized;
  if (FLAT_TO_SHARP[normalized]) return FLAT_TO_SHARP[normalized];
  return null;
}

/** Normalize a full tuning string like "e-a-d-g-b-e" → "E-A-D-G-B-E".
 *  Returns null if any note is invalid. */
export function normalizeTuning(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('-').map((p) => normalizeNote(p.trim()));
  if (parts.some((p) => p === null)) return null;
  return parts.join('-');
}

export function getSongTunings(
  song: Pick<Song, 'roleGroups' | 'tunings' | 'songType'>
): TuningInfo[] {
  const tunings: TuningInfo[] = [];
  const seen = new Set<string>();

  // Originals: read from song.tunings (Record<Role, string>)
  if (song.songType === 'original' && song.tunings) {
    for (const [role, tuning] of Object.entries(song.tunings)) {
      if ((role === 'Guitar' || role === 'Bass') && tuning) {
        const key = `${role}:${tuning}`;
        if (!seen.has(key)) {
          seen.add(key);
          tunings.push({ tuning, role: role as 'Guitar' | 'Bass' });
        }
      }
    }
  }

  // Fall through for both originals and covers to the sort below.
  for (const rg of song.roleGroups ?? []) {
    if (rg.role === 'Guitar' || rg.role === 'Bass') {
      for (const t of rg.tracks ?? []) {
        if (t.tuning) {
          const tuningStr = t.tuning.trim();
          const key = `${rg.role}:${tuningStr}`;
          if (!seen.has(key)) {
            seen.add(key);
            tunings.push({ tuning: tuningStr, role: rg.role });
          }
        }
      }
    }
  }

  // Ensure consistent ordering: Guitar always before Bass
  const rolePriority: Record<string, number> = { Guitar: 0, Bass: 1 };
  tunings.sort((a, b) => (rolePriority[a.role] ?? 99) - (rolePriority[b.role] ?? 99));

  return tunings;
}
