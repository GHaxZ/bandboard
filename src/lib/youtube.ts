/* eslint-disable @typescript-eslint/no-explicit-any */
export interface YouTubeVideo {
  videoId: string;
  title: string;
  channelName: string;
  viewsText: string;
  viewCount: number;
  thumbnail: string;
  url: string;
}

function parseViews(text: string): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  
  // Detect multiplier
  let multiplier = 1;
  if (lower.includes('mio') || lower.includes('mill') || (lower.includes('m') && !lower.includes('mil'))) {
    multiplier = 1_000_000;
  } else if (lower.includes('k') || lower.includes('tsd') || lower.includes('thous') || lower.includes('mil')) {
    multiplier = 1_000;
  }
  
  // Extract digits and separators
  const numMatch = lower.replace(/[^0-9.,]/g, '').trim();
  if (!numMatch) return 0;
  
  // Decimal multiplier check
  if (multiplier > 1) {
    const cleanNum = numMatch.replace(',', '.'); // normalize comma to dot
    return (parseFloat(cleanNum) || 0) * multiplier;
  }
  
  // Absolute numbers
  const cleanNum = numMatch.replace(/[.,]/g, '');
  return parseInt(cleanNum, 10) || 0;
}

// Scrape YouTube search results from public HTML
async function scrapeYouTube(query: string): Promise<YouTubeVideo[]> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`YouTube scrape failed with status ${response.status}`);
    }

    const html = await response.text();
    // Locate the ytInitialData JSON object in the page
    const startPattern = 'var ytInitialData = ';
    const startIndex = html.indexOf(startPattern);
    if (startIndex === -1) {
      // Try alternate format
      const altPattern = 'window["ytInitialData"] = ';
      const altStartIndex = html.indexOf(altPattern);
      if (altStartIndex === -1) {
        throw new Error('ytInitialData not found in HTML');
      }
      return parseYtInitialData(html, altStartIndex + altPattern.length);
    }
    return parseYtInitialData(html, startIndex + startPattern.length);
  } catch (error) {
    console.error('YouTube scraping error:', error);
    return [];
  }
}

function parseYtInitialData(html: string, startIndex: number): YouTubeVideo[] {
  let depth = 0;
  let endIndex = -1;
  for (let i = startIndex; i < html.length; i++) {
    if (html[i] === '{') {
      depth++;
    } else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }

  if (endIndex === -1) {
    throw new Error('Unbalanced JSON braces in ytInitialData');
  }

  const jsonStr = html.slice(startIndex, endIndex);
  const data = JSON.parse(jsonStr);
  const videos: YouTubeVideo[] = [];

  try {
    const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents
      || data.contents?.twoColumnSearchResultRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (!contents || !Array.isArray(contents)) return [];

    const itemSection = contents.find((c: any) => c.itemSectionRenderer);
    const items = itemSection?.itemSectionRenderer?.contents;
    if (!items || !Array.isArray(items)) return [];

    for (const item of items) {
      if (item.videoRenderer) {
        const vr = item.videoRenderer;
        const videoId = vr.videoId;
        const title = vr.title?.runs?.[0]?.text || '';
        const channelName = vr.ownerText?.runs?.[0]?.text || '';
        const viewsText = vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || '';
        const thumbnail = vr.thumbnail?.thumbnails?.[0]?.url || '';

        if (videoId && title) {
          videos.push({
            videoId,
            title,
            channelName,
            viewsText,
            viewCount: parseViews(viewsText),
            thumbnail,
            url: `https://youtube.com/watch?v=${videoId}`,
          });
        }
      }
    }
  } catch (e) {
    console.error('Error walking ytInitialData object:', e);
  }

  return videos;
}

// Official API search
async function apiYouTube(query: string, apiKey: string): Promise<YouTubeVideo[]> {
  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
      query
    )}&type=video&key=${apiKey}&maxResults=10`;
    
    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`YouTube API returned status ${res.status}`);
    }
    const data = await res.json();
    const items = data.items || [];
    const videoIds = items.map((item: any) => item.id.videoId).filter(Boolean);

    if (videoIds.length === 0) return [];

    // To get view counts, we need to fetch the video statistics
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(
      ','
    )}&key=${apiKey}`;
    const statsRes = await fetch(statsUrl, {
      signal: AbortSignal.timeout(5000),
    });
    const statsData = statsRes.ok ? await statsRes.json() : { items: [] };
    const viewMap = new Map<string, number>();
    const viewTextMap = new Map<string, string>();

    for (const item of statsData.items || []) {
      const count = parseInt(item.statistics?.viewCount || '0', 10);
      viewMap.set(item.id, count);
      viewTextMap.set(item.id, count.toLocaleString() + ' views');
    }

    return items.map((item: any) => {
      const vId = item.id.videoId;
      const views = viewMap.get(vId) || 0;
      const viewsText = viewTextMap.get(vId) || '0 views';
      return {
        videoId: vId,
        title: item.snippet.title,
        channelName: item.snippet.channelTitle,
        viewsText,
        viewCount: views,
        thumbnail: item.snippet.thumbnails?.default?.url || '',
        url: `https://youtube.com/watch?v=${vId}`,
      };
    });
  } catch (error) {
    console.error('YouTube API error, falling back to scrape:', error);
    return scrapeYouTube(query);
  }
}

export async function searchYouTube(query: string): Promise<YouTubeVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    return apiYouTube(query, apiKey);
  }
  return scrapeYouTube(query);
}

export function getYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  return match ? match[1] : null;
}
