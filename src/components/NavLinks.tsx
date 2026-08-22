"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Music as MusicIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Client island for the dashboard nav + mobile footer — the only reason the
 * layout used to be a client component.
 */
export function NavLinks() {
  const pathname = usePathname();

  const isRehearsals = pathname.startsWith("/rehearsals");
  const isLibrary = pathname.startsWith("/library") || pathname.startsWith("/songs");
  const isSettings = pathname.startsWith("/settings");

  return (
    <>
      <nav className="hidden md:flex items-center gap-1.5 bg-card border border-border p-1 rounded-xl">
        <Link
          href="/rehearsals"
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200",
            isRehearsals
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <CalendarIcon className="w-4 h-4" /> Rehearsals
        </Link>
        <Link
          href="/library"
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200",
            isLibrary
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MusicIcon className="w-4 h-4" /> Song Library
        </Link>
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200",
            isSettings
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <SettingsIcon className="w-4 h-4" /> Settings
        </Link>
      </nav>

      <footer className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/90 backdrop-blur-lg border-t border-border px-6 py-2.5 flex items-center justify-around shadow-2xl">
        <Link
          href="/rehearsals"
          className={cn(
            "flex flex-col items-center gap-1 py-1 font-bold text-[10px] transition-all duration-200",
            isRehearsals
              ? "text-foreground scale-105"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <CalendarIcon className="w-5 h-5" />
          Rehearsals
        </Link>
        <Link
          href="/library"
          className={cn(
            "flex flex-col items-center gap-1 py-1 font-bold text-[10px] transition-all duration-200",
            isLibrary
              ? "text-foreground scale-105"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MusicIcon className="w-5 h-5" />
          Library
        </Link>
        <Link
          href="/settings"
          className={cn(
            "flex flex-col items-center gap-1 py-1 font-bold text-[10px] transition-all duration-200",
            isSettings
              ? "text-foreground scale-105"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <SettingsIcon className="w-5 h-5" />
          Settings
        </Link>
      </footer>
    </>
  );
}
