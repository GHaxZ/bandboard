import type { Role } from '@/lib/constants';

/**
 * Build a YouTube search query for a given song + role + media type.
 * Extracted from the prototype's `utils.getYouTubeQuery` (PLAN §8).
 */
export function getYouTubeQuery(
  artist: string,
  title: string,
  role: Role | string,
  type: 'backing' | 'tab',
  instrumentName: string
): string {
  const a = artist.trim();
  const t = title.trim();
  const r = role.toLowerCase();

  if (type === 'backing') {
    if (r === 'vocals') return `${a} ${t} instrumental`;
    if (r === 'bass') return `${a} ${t} no bass backing track`;
    if (r === 'drums') return `${a} ${t} no drums backing track`;
    if (r === 'guitar') return `${a} ${t} no guitar backing track`;
    if (r === 'piano/keyboard' || r === 'piano' || r === 'keyboard')
      return `${a} ${t} no piano keyboard backing track`;
    return `${a} ${t} ${instrumentName} backing track`;
  }

  // type === 'tab'
  if (r === 'vocals') return `${a} ${t}`;
  if (r === 'piano/keyboard' || r === 'piano' || r === 'keyboard')
    return `${a} ${t} piano keyboard tab`;
  if (r === 'guitar') return `${a} ${t} guitar tab`;
  if (r === 'bass') return `${a} ${t} bass tab`;
  if (r === 'drums') return `${a} ${t} drums tab`;
  return `${a} ${t} ${instrumentName} tab`;
}
