import type { Song } from '@/types/models';

export interface TuningInfo {
  tuning: string;
  role: 'Guitar' | 'Bass';
}

export function getSongTunings(
  song: Pick<Song, 'roleGroups'>
): TuningInfo[] {
  const tunings: TuningInfo[] = [];
  const seen = new Set<string>();

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

  return tunings;
}
