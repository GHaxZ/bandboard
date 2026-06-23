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

    const restoreFocus = () => {
      if (document.activeElement && document.activeElement.tagName === "IFRAME") {
        (document.activeElement as HTMLElement).blur();
        window.focus();
      }
      iframeFocused = false;
    };

    const handleBlur = () => {
      setTimeout(() => {
        if (document.activeElement && document.activeElement.tagName === "IFRAME") {
          iframeFocused = true;

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

    const handleFocusIn = (e: FocusEvent) => {
      if (iframeFocused) {
        iframeFocused = false;
        if (e.target && e.target !== window && e.target !== document) {
          try {
            (e.target as HTMLElement).blur();
          } catch (err) {}
        }
        window.focus();
        
        // Dispatch simulated Tab keydown event to window to toggle views/video
        const tabEvent = new KeyboardEvent("keydown", {
          key: "Tab",
          code: "Tab",
          bubbles: true,
          cancelable: true,
        });
        window.dispatchEvent(tabEvent);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (e.buttons > 0) return;
      // Do not auto-restore focus on mouse move if mouse is within the player container.
      // PracticeMode and RehearsalAutoplay handle MouseLeave to restore focus.
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
          } else {
            lastTime = currentTime;
          }
        } catch (e) { }
      }
    }, 100);

    window.addEventListener("blur", handleBlur);
    document.addEventListener("focusin", handleFocusIn);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("mousemove", handleMouseMove);
      clearInterval(interval);
    };
  }, []);
}

