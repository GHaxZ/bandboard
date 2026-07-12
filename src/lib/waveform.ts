let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    if (!window.AudioContext) return null;
    audioCtx = new window.AudioContext();
  }
  return audioCtx;
}

const PEAK_RESOLUTION = 4000;
const peakCache = new Map<string, { peaks: Float32Array; duration: number }>();

// ponytail: fetches full file for decode. Fine for local band stems (3-10MB).
// Switch to Range-fetch + progressive decode if large files cause latency.
export async function getWaveformPeaks(
  trackId: string,
  srcUrl: string
): Promise<{ peaks: Float32Array; duration: number } | null> {
  if (peakCache.has(trackId)) return peakCache.get(trackId)!;

  try {
    const response = await fetch(srcUrl);
    const arrayBuffer = await response.arrayBuffer();
    const ctx = getAudioContext();
    if (!ctx) return null;
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const samplesPerPeak = Math.max(1, Math.floor(channelData.length / PEAK_RESOLUTION));
    const peaks = new Float32Array(PEAK_RESOLUTION * 2);

    for (let i = 0; i < PEAK_RESOLUTION; i++) {
      let min = 1.0;
      let max = -1.0;
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, channelData.length);
      for (let j = start; j < end; j++) {
        const v = channelData[j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      peaks[i * 2] = min;
      peaks[i * 2 + 1] = max;
    }

    const result = { peaks, duration: audioBuffer.duration };
    peakCache.set(trackId, result);
    return result;
  } catch {
    return null;
  }
}

export function getCachedPeaks(trackId: string): { peaks: Float32Array; duration: number } | null {
  return peakCache.get(trackId) ?? null;
}
