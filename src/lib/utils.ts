import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Constant-time string comparison for secrets. Length is compared in the
 * clear (unavoidable, and length is not sensitive for a shared secret), but
 * content comparison never short-circuits.
 * ponytail: pure-JS so it works in both Node and Edge runtimes without a
 * node:crypto dependency in middleware.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/** Format seconds → MM:SS (padded). */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Compact remaining-time label for countdowns ("2d 3h", "45m", "<1m").
 * Negative/zero → null (caller renders an "ended" state).
 */
export function formatTimeLeft(msRemaining: number): string | null {
  if (msRemaining <= 0) return null;
  const minutes = Math.floor(msRemaining / 60_000);
  if (minutes < 1) return "<1m";
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function getAlternativeLinks(tabLink: string) {
  if (!tabLink || !tabLink.includes("-tab-s")) {
    return {
      tab: tabLink,
      sheet: tabLink,
      chords: tabLink,
    };
  }
  const sheet = tabLink.replace("-tab-s", "-sheet-s");
  const chords = tabLink.replace(/-tab-s(\d+)(t\d+)?/, "-chords-s$1");
  return {
    tab: tabLink,
    sheet,
    chords,
  };
}

/**
 * ID of the entry that should become selected after `removedId` is removed
 * from `list`: the entry below it, else the one above (the new last), else
 * null when the list ends up empty.
 */
export function neighborId<T>(
  list: T[],
  removedId: string,
  getId: (item: T) => string
): string | null {
  const idx = list.findIndex((item) => getId(item) === removedId);
  if (idx === -1) return null;
  const remaining = list.filter((item) => getId(item) !== removedId);
  if (remaining.length === 0) return null;
  return getId(remaining[Math.min(idx, remaining.length - 1)]);
}

/** Preset voting end: 24h before the rehearsal. If that already passed, the
 *  closest valid moment (≥1h from now, still before the rehearsal). May still
 *  be invalid for imminent/past rehearsals — submit-time validation catches it. */
export function defaultVotingEnd(rehearsalDate: number): number {
  const dayBefore = rehearsalDate - 24 * 60 * 60 * 1000;
  if (dayBefore > Date.now()) return dayBefore;
  return Math.min(rehearsalDate - 60_000, Date.now() + 60 * 60 * 1000);
}

/** Timestamp → "YYYY-MM-DDTHH:mm" for <input type="datetime-local"> (local time). */
export function toDateTimeLocal(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * RFC4122 v4 UUID that works in non-secure browser contexts (plain HTTP,
 * non-localhost hosts) where crypto.randomUUID() is undefined.
 * ponytail: falls back to getRandomValues v4; upgrade to randomUUID only
 * when app is served exclusively over HTTPS.
 */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return (
    h(b[0]) + h(b[1]) + h(b[2]) + h(b[3]) + "-" +
    h(b[4]) + h(b[5]) + "-" +
    h(b[6]) + h(b[7]) + "-" +
    h(b[8]) + h(b[9]) + "-" +
    h(b[10]) + h(b[11]) + h(b[12]) + h(b[13]) + h(b[14]) + h(b[15])
  );
}
