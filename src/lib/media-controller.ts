// Unified interface for media playback controls, abstracting YouTube IFrame
// players and HTML <video>/<audio> elements behind a common surface. The
// dual-sync engine operates on this interface, so cover-song backing/tab
// slots can be either YT links or uploaded custom files interchangeably.

export interface MediaController {
  play(): void;
  pause(): void;
  seekTo(seconds: number, allow: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  /** Returns the player's state in YouTube-compatible codes:
   * -1 unstarted, 0 ended, 1 playing, 2 paused, 5 cued. */
  getState(): number;
  setMuted(muted: boolean): void;
}

/** Minimal playback surface exposed to PracticeShell so the unified UI can
 *  control either the cover dual-synced engine or the original multistem
 *  engine through the same interface. */
export interface PlaybackEngine {
  playPause(): void;
  seekBy(delta: number): void;
  seekTo(time: number): void;
  getCurrentTime(): number;
  readonly duration: number;
  readonly isPlaying: boolean;
}

/**
 * Shared play/pause decision for YouTube-state players: states 1 (playing)
 * and 3 (buffering) both mean "currently advancing" and should pause —
 * treating buffering as playing lets the user cancel a stuck YouTube buffer
 * by clicking pause.
 */
export function togglePlayPause(p: {
  getState(): number;
  play(): void;
  pause(): void;
}): void {
  const state = p.getState();
  if (state === 1 || state === 3) p.pause();
  else p.play();
}