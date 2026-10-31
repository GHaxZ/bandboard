import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchYouTube } from './youtube';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('YouTube lookup', () => {
  it('parses braces and escaped quotes inside video titles', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', '');
    const title = 'A } title with "quotes" and { braces';
    const data = { contents: { twoColumnSearchResultsRenderer: { primaryContents: {
      sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: [{ videoRenderer: {
        videoId: 'abcdefghijk', title: { runs: [{ text: title }] },
      } }] } }] },
    } } } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`var ytInitialData = ${JSON.stringify(data)};</script>`)));
    expect(await searchYouTube('song')).toEqual([expect.objectContaining({ title, videoId: 'abcdefghijk' })]);
  });

  it('reports an upstream failure instead of returning a successful empty search', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', '');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(searchYouTube('song')).rejects.toThrow('503');
  });
});
