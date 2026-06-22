import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

export function getYouTubeQuery(
  artist: string,
  title: string,
  role: string,
  type: "backing" | "tab",
  instrumentName: string
): string {
  const verifiedArtist = artist.trim();
  const verifiedTitle = title.trim();

  if (type === "backing") {
    if (role === "Vocals") {
      return `${verifiedArtist} ${verifiedTitle} instrumental`;
    } else if (role === "Bass") {
      return `${verifiedArtist} ${verifiedTitle} no bass backing track`;
    } else if (role === "Drums") {
      return `${verifiedArtist} ${verifiedTitle} no drums backing track`;
    } else if (role === "Guitar") {
      return `${verifiedArtist} ${verifiedTitle} no guitar backing track`;
    } else if (role === "Piano/Keyboard") {
      return `${verifiedArtist} ${verifiedTitle} no piano keyboard backing track`;
    } else {
      return `${verifiedArtist} ${verifiedTitle} ${instrumentName} backing track`;
    }
  } else {
    if (role === "Vocals") {
      return `${verifiedArtist} ${verifiedTitle}`;
    } else if (role === "Piano/Keyboard") {
      return `${verifiedArtist} ${verifiedTitle} piano keyboard tab`;
    } else if (role === "Guitar") {
      return `${verifiedArtist} ${verifiedTitle} guitar tab`;
    } else if (role === "Bass") {
      return `${verifiedArtist} ${verifiedTitle} bass tab`;
    } else if (role === "Drums") {
      return `${verifiedArtist} ${verifiedTitle} drums tab`;
    } else {
      return `${verifiedArtist} ${verifiedTitle} ${instrumentName} tab`;
    }
  }
}

