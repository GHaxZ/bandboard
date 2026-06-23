import { useEffect, useRef } from "react";

interface PracticeKeyboardConfig {
  onToggleVideo?: () => void;
  onPlayPause?: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
  onMarkerJump?: (index: number) => void;
}

export function usePracticeKeyboard(config: PracticeKeyboardConfig) {
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.key === "Tab") {
        if (configRef.current.onToggleVideo) {
          e.preventDefault();
          configRef.current.onToggleVideo();
        }
        return;
      }

      if (e.key === " ") {
        if (configRef.current.onPlayPause) {
          e.preventDefault();
          configRef.current.onPlayPause();
        }
        return;
      }

      if (e.key === "ArrowLeft") {
        if (configRef.current.onSeekBackward) {
          e.preventDefault();
          configRef.current.onSeekBackward();
        }
        return;
      }

      if (e.key === "ArrowRight") {
        if (configRef.current.onSeekForward) {
          e.preventDefault();
          configRef.current.onSeekForward();
        }
        return;
      }

      if (e.key >= "1" && e.key <= "9") {
        if (configRef.current.onMarkerJump) {
          const index = parseInt(e.key) - 1;
          configRef.current.onMarkerJump(index);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
