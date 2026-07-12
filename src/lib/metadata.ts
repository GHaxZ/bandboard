// ---------------------------------------------------------------------------
// iTunes album art (PLAN §14 step 3)
// ---------------------------------------------------------------------------
export async function fetchAlbumArt(
  artist: string,
  title: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}+${encodeURIComponent(
        title
      )}&entity=song&limit=1`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data && Array.isArray(data.results) && data.results.length > 0) {
      const url = data.results[0].artworkUrl100;
      if (typeof url === 'string') {
        return url.replace('100x100bb.jpg', '300x300bb.jpg');
      }
    }
  } catch (e) {
    console.error('iTunes album art lookup failed:', e);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Genius lyrics URL (PLAN §14 step 4)
// ---------------------------------------------------------------------------
const GENIUS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchGeniusLyricsUrl(
  artist: string,
  title: string
): Promise<string | null> {
  try {
    const query = `${artist} ${title}`;
    const res = await fetch(
      `https://genius.com/api/search/multi?q=${encodeURIComponent(query)}`,
      {
        headers: { 'User-Agent': GENIUS_UA },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const songSection = data?.response?.sections?.find(
      (s: { type: string }) => s.type === 'song'
    );
    if (songSection && Array.isArray(songSection.hits) && songSection.hits.length > 0) {
      const url = songSection.hits[0].result?.url;
      if (typeof url === 'string') return url;
    }
  } catch (e) {
    console.error('Genius search lookup failed:', e);
  }
  return null;
}
