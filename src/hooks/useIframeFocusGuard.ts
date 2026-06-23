import { useEffect, useRef } from "react";

export function useIframeFocusGuard(getActivePlayer: () => any) {
  const getActivePlayerRef = useRef(getActivePlayer);

  useEffect(() => {
    getActivePlayerRef.current = getActivePlayer;
  }, [getActivePlayer]);

  useEffect(() => {
    let iframeFocused = false;
    let lastTime = -1;
    let lastState = -1;
    let focusTimeout: NodeJS.Timeout | null = null;

    const restoreFocus = () => {
      if (document.activeElement && document.activeElement.tagName === "IFRAME") {
        (document.activeElement as HTMLElement).blur();
        window.focus();
      }
      iframeFocused = false;
      if (focusTimeout) {
        clearTimeout(focusTimeout);
        focusTimeout = null;
      }
    };

    const handleBlur = () => {
      setTimeout(() => {
        if (document.activeElement && document.activeElement.tagName === "IFRAME") {
          iframeFocused = true;

          if (focusTimeout) clearTimeout(focusTimeout);
          focusTimeout = setTimeout(restoreFocus, 50);

          const activePlayer = getActivePlayerRef.current();
          if (activePlayer) {
            try {
              if (typeof activePlayer.getCurrentTime === "function") lastTime = activePlayer.getCurrentTime();
              if (typeof activePlayer.getPlayerState === "function") lastState = activePlayer.getPlayerState();
            } catch (e) { }
          }
        }
      }, 50);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (e.buttons > 0) return;

      if (iframeFocused && document.activeElement && document.activeElement.tagName === "IFRAME") {
        restoreFocus();
      }
    };

    const interval = setInterval(() => {
      if (!iframeFocused || !document.activeElement || document.activeElement.tagName !== "IFRAME") {
        return;
      }

      const activePlayer = getActivePlayerRef.current();
      if (activePlayer) {
        try {
          let currentTime = lastTime;
          let currentState = lastState;

          if (typeof activePlayer.getCurrentTime === "function") currentTime = activePlayer.getCurrentTime();
          if (typeof activePlayer.getPlayerState === "function") currentState = activePlayer.getPlayerState();

          const timeDiff = currentTime - lastTime;
          const isPlaying = currentState === 1;
          const isNaturalPlayback = isPlaying && Math.abs(timeDiff - 0.1) < 0.08;

          const stateChanged = currentState !== lastState;
          const userSeeked = !isNaturalPlayback && Math.abs(timeDiff) > 0.8;

          if (stateChanged || userSeeked) {
            lastTime = currentTime;
            lastState = currentState;

            if (focusTimeout) clearTimeout(focusTimeout);
            focusTimeout = setTimeout(restoreFocus, 50);
          } else {
            lastTime = currentTime;
          }
        } catch (e) { }
      }
    }, 100);

    window.addEventListener("blur", handleBlur);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("mousemove", handleMouseMove);
      clearInterval(interval);
      if (focusTimeout) clearTimeout(focusTimeout);
    };
  }, []);
}
