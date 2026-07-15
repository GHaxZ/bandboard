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
