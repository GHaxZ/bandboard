// ponytail: read-boundary adapter. Raw DB rows expose `tunings` as a JSON text
// column; the Song TS type models it parsed. All other new columns (songType,
// coverArtStoredName, backingCustomTrackId, tabCustomTrackId) are scalars that
// already match, so only tunings needs transforming here. tunings parsed once
// per read is fine — these queries already eager-load roleGroups+tracks.

/** Parse the JSON `tunings` column of a song row into the typed Song.tunings. */
export function mapSong<T extends { tunings: string | null }>(
  row: T
): Omit<T, 'tunings'> & { tunings: Record<string, string> | null } {
  let tunings: Record<string, string> | null = null;
  if (row.tunings) {
    try {
      const parsed: unknown = JSON.parse(row.tunings);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        tunings = parsed as Record<string, string>;
      }
    } catch {
      tunings = null;
    }
  }
  return { ...row, tunings };
}