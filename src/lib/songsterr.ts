// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface SongsterrTrack {
  hash?: string;
  instrumentId?: number;
  instrument?: string;
  name?: string;
  tuning?: number[];
}

export interface SongsterrResult {
  songsterrId: number | null;
  verifiedTitle: string;
  verifiedArtist: string;
  rawTracks: SongsterrTrack[];
}

// ---------------------------------------------------------------------------
// Role classification (PLAN §14.1)
// ---------------------------------------------------------------------------
export type ClassifiedRole =
  | 'Guitar'
  | 'Bass'
  | 'Drums'
  | 'Vocals'
  | 'Piano/Keyboard'
  | 'Other';

export function determineRole(
  hash: string,
  instrumentId: number,
  instrument: string,
  trackName: string
): ClassifiedRole {
  const lowerHash = (hash || '').toLowerCase();
  const lowerInst = (instrument || '').toLowerCase();
  const lowerTrack = (trackName || '').toLowerCase();
  const combined = `${lowerInst} ${lowerTrack}`.trim();

  // 1. Vocals
  if (
    lowerHash.startsWith('vocals') ||
    instrumentId === 42 ||
    combined.includes('vocal') ||
    combined.includes('sing') ||
    combined.includes('voice') ||
    combined.includes('choir')
  ) {
    return 'Vocals';
  }

  // 2. Drums
  if (lowerHash.startsWith('drums') || instrumentId === 1024 || combined.includes('drum')) {
    const nonDrumsPerc = [
      'glockenspiel', 'marimba', 'xylophone', 'vibraphone', 'timpani', 'bell', 'chime',
      'triangle', 'tambourine', 'shaker', 'claves', 'cowbell', 'cabasa', 'maracas',
      'congas', 'bongos', 'guiro', 'steel drum', 'woodblock', 'castanets',
    ];
    if (nonDrumsPerc.some((p) => combined.includes(p))) return 'Other';
    return 'Drums';
  }

  // 3. Bass
  if (lowerHash.startsWith('bass') || [32, 33, 34].includes(instrumentId) || combined.includes('bass')) {
    if (combined.includes('synth bass') || combined.includes('keyboard bass')) return 'Piano/Keyboard';
    if (
      combined.includes('double bass') ||
      combined.includes('contrabass') ||
      combined.includes('cello') ||
      combined.includes('upright bass')
    )
      return 'Other';
    return 'Bass';
  }

  // 4. Piano/Keyboard
  if (
    [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20].includes(instrumentId) ||
    combined.includes('piano') ||
    combined.includes('keyboard') ||
    combined.includes('organ') ||
    combined.includes('synth') ||
    combined.includes('clav') ||
    combined.includes('harpsichord') ||
    combined.includes('mellotron') ||
    combined.includes('rhodes') ||
    combined.includes('wurlitzer')
  ) {
    const nonKeyboard = [
      'glockenpiel', 'celesta', 'music box', 'vibraphone', 'marimba', 'xylophone',
      'tubular bells', 'dulcimer',
    ];
    if (nonKeyboard.some((k) => combined.includes(k))) return 'Other';
    return 'Piano/Keyboard';
  }

  // 5. Guitar
  if (lowerHash.startsWith('guitar') || instrumentId === 30 || combined.includes('guitar')) {
    return 'Guitar';
  }

  return 'Other';
}

// ---------------------------------------------------------------------------
// Tuning parse (PLAN §14.2)
// ---------------------------------------------------------------------------
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function parseTuning(tuningArray?: number[]): string {
  if (!tuningArray || tuningArray.length === 0) return 'Standard';
  return [...tuningArray]
    .reverse()
    .map((note) => NOTE_NAMES[note % 12])
    .join('-');
}

// ---------------------------------------------------------------------------
// Tab deep-link (PLAN §14.3)
// ---------------------------------------------------------------------------
export function buildTabLink(
  songsterrId: number | null,
  artistSlug: string,
  titleSlug: string,
  trackIndex: number
): string {
  if (!songsterrId) return 'https://www.songsterr.com';
  return `https://www.songsterr.com/a/wsa/${artistSlug}-${titleSlug}-tab-s${songsterrId}t${trackIndex}`;
}

// ---------------------------------------------------------------------------
// Songsterr lookup (PLAN §14 step 2)
// ---------------------------------------------------------------------------
export async function fetchSongsterr(
  title: string,
  artist: string
): Promise<SongsterrResult> {
  const formattedTitle = title.trim();
  const formattedArtist = artist.trim();

  try {
    const response = await fetch(
      `https://www.songsterr.com/api/songs?pattern=${encodeURIComponent(formattedTitle)}+${encodeURIComponent(
        formattedArtist
      )}`,
      { signal: AbortSignal.timeout(3000) }
    );

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const bestMatch = data[0];
        return {
          songsterrId: bestMatch.songId ?? null,
          verifiedTitle: bestMatch.title || formattedTitle,
          verifiedArtist: bestMatch.artist || formattedArtist,
          rawTracks: bestMatch.tracks || [],
        };
      }
    }
  } catch (e) {
    console.error('Songsterr API lookup failed/timed out:', e);
  }

  return {
    songsterrId: null,
    verifiedTitle: formattedTitle,
    verifiedArtist: formattedArtist,
    rawTracks: [],
  };
}

/** Group raw Songsterr tracks by classified role, preserving original index. */
export function groupTracksByRole(
  rawTracks: SongsterrTrack[]
): Map<ClassifiedRole, { track: SongsterrTrack; index: number }[]> {
  const grouped = new Map<ClassifiedRole, { track: SongsterrTrack; index: number }[]>();
  rawTracks.forEach((track, index) => {
    const role = determineRole(
      track.hash || '',
      track.instrumentId ?? -1,
      track.instrument || '',
      track.name || ''
    );
    if (!grouped.has(role)) grouped.set(role, []);
    grouped.get(role)!.push({ track, index });
  });
  return grouped;
}


