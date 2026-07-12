import { useState, useEffect } from "react";

declare global {
  interface Window {
    YT?: {
      Player: new (id: string | HTMLElement, opts: Record<string, unknown>) => unknown;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

function loadYoutubeApi(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve) => {
    // Inject the script once.
    let script = document.getElementById("youtube-iframe-api") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(script, firstScriptTag);
    }

    // Chain any pre-existing handler instead of clobbering.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };

    // Poll fallback (some setups don't fire the callback reliably).
    const interval = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });

  return apiPromise;
}

/** Returns `true` once the YouTube IFrame API is loaded. */
export function useYoutubeApi(): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadYoutubeApi().then(() => {
      if (mounted) setLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return loaded;
}

export { loadYoutubeApi };
