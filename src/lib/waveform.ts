let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    if (!window.AudioContext) return null;
    audioCtx = new window.AudioContext({ sampleRate: 8000 });
  }
  return audioCtx;
}

const PEAK_RESOLUTION = 4000;

// ponytail: bounded cache — 50 entries max, simple FIFO eviction.
// Switch to LRU if waveform browsing patterns show hot/cold reuse.
const MAX_CACHE = 50;
const peakCache = new Map<string, { peaks: Float32Array; duration: number }>();

function cacheSet(key: string, value: { peaks: Float32Array; duration: number }) {
  if (peakCache.size >= MAX_CACHE) {
    const first = peakCache.keys().next().value;
    if (first !== undefined) peakCache.delete(first);
  }
  peakCache.set(key, value);
}

// Close AudioContext on page unload to free the audio hardware lock.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (audioCtx) {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  });
}

// Bound compressed input, metadata duration and simultaneous decodes. Lower
// sample rate reduces the temporary PCM allocation used only for peak previews.
const MAX_WAVEFORM_BYTES = 16 * 1024 * 1024;
const MAX_WAVEFORM_SECONDS = 600;
let decodeTail: Promise<unknown> = Promise.resolve();
let queued = 0;
const inFlight = new Map<string, Promise<{ peaks: Float32Array; duration: number } | null>>();

export function getWaveformPeaks(
  trackId: string,
  srcUrl: string
): Promise<{ peaks: Float32Array; duration: number } | null> {
  const cached = peakCache.get(trackId);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(trackId);
  if (pending) return pending;

  if (queued >= 16) return Promise.resolve(null);
  queued++;
  const task = decodeTail.then(() => decodePeaks(srcUrl))
    .then((result) => {
      inFlight.delete(trackId);
      if (result) cacheSet(trackId, result);
      return result;
    })
    .catch(() => {
      inFlight.delete(trackId);
      return null;
    });
  decodeTail = task.finally(() => { queued--; });
  inFlight.set(trackId, task);
  return task;
}

async function decodePeaks(
  srcUrl: string
): Promise<{ peaks: Float32Array; duration: number } | null> {
  const response = await fetch(srcUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) return null;
  if (Number(response.headers.get('content-length')) > MAX_WAVEFORM_BYTES) { await response.body.cancel(); return null; }
  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_WAVEFORM_BYTES) return null;
      chunks.push(value.slice().buffer);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const blob = new Blob(chunks);
  const duration = await mediaDuration(blob);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_WAVEFORM_SECONDS) return null;
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = getAudioContext();
  if (!ctx) return null;
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  if (audioBuffer.duration > MAX_WAVEFORM_SECONDS || audioBuffer.numberOfChannels > 8) return null;
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

  return { peaks, duration: audioBuffer.duration };
}

export function getCachedPeaks(trackId: string): { peaks: Float32Array; duration: number } | null {
  return peakCache.get(trackId) ?? null;
}

/** Read container metadata before allocating the full Web Audio PCM buffer. */
function mediaDuration(blob: Blob): Promise<number> {
  if (typeof document === 'undefined') return Promise.resolve(NaN);
  return new Promise(resolve => {
    const media = document.createElement('audio');
    const url = URL.createObjectURL(blob);
    const timer = setTimeout(() => finish(NaN), 5000);
    function finish(duration: number) {
      clearTimeout(timer);
      media.onloadedmetadata = null; media.onerror = null;
      media.removeAttribute('src'); media.load(); URL.revokeObjectURL(url);
      resolve(duration);
    }
    media.preload = 'metadata';
    media.onloadedmetadata = () => finish(media.duration);
    media.onerror = () => finish(NaN);
    media.src = url;
  });
}
