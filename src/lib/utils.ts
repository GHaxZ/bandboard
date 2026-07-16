import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
