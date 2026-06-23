import { useState, useEffect } from "react";

export function useYoutubeApi() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).YT && (window as any).YT.Player) {
      setLoaded(true);
      return;
    }

    let script = document.getElementById("youtube-iframe-api") as HTMLScriptElement;
    if (!script) {
      script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(script, firstScriptTag);
    }

    const previousReady = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      if (previousReady) previousReady();
      setLoaded(true);
    };

    const interval = setInterval(() => {
      if ((window as any).YT && (window as any).YT.Player) {
        setLoaded(true);
        clearInterval(interval);
      }
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return loaded;
}
