// Device-local playback settings: stored in browser cookies so they stay
// per-device, instead of following the account on the server.
// Naming mirrors bandboard_uid / bandboard_session (lib/constants.ts).
export const VOLUME_COOKIE = "bandboard_volume";
export const SPEED_COOKIE = "bandboard_speed";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
// Mirrors clampPlaybackSpeed in lib/validation.ts (SPEED_MIN/MAX are integer percent).
const SPEED_MIN = 0.5;
const SPEED_MAX = 2.0;

export function clampDeviceVolume(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function clampDeviceSpeed(v: number): number {
  return Math.max(SPEED_MIN, Math.min(SPEED_MAX, v));
}

function setCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

/** Client only — persist the device volume cookie. */
export function writeDeviceVolume(v: number): void {
  setCookie(VOLUME_COOKIE, String(clampDeviceVolume(v)));
}

/** Client only — persist the device speed cookie. */
export function writeDeviceSpeed(v: number): void {
  setCookie(SPEED_COOKIE, String(clampDeviceSpeed(v)));
}

/** Parse a raw cookie value; anything missing/invalid falls back to the default. */
export function parseDeviceVolume(raw: string | undefined | null): number {
  if (!raw) return 100;
  const n = Number(raw);
  return Number.isFinite(n) ? clampDeviceVolume(n) : 100;
}

export function parseDeviceSpeed(raw: string | undefined | null): number {
  if (!raw) return 1.0;
  const n = Number(raw);
  return Number.isFinite(n) ? clampDeviceSpeed(n) : 1.0;
}

/** Client only — read the device settings from document.cookie. */
export function readDeviceVolumeClient(): number {
  if (typeof document === "undefined") return 100;
  const match = document.cookie.match(/(?:^|;\s*)bandboard_volume=(\d*)/);
  return parseDeviceVolume(match?.[1]);
}

export function readDeviceSpeedClient(): number {
  if (typeof document === "undefined") return 1.0;
  const match = document.cookie.match(/(?:^|;\s*)bandboard_speed=([\d.]*)/);
  return parseDeviceSpeed(match?.[1]);
}
