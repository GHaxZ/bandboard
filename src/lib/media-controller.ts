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
  /** Accepts volume in 0..100 (matches the userSettings store). */
  setVolume(volume: number): void;
  setPlaybackRate(rate: number): void;
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