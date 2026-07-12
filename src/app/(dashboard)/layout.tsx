"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Music as MusicIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isRehearsals = pathname.startsWith("/rehearsals");
  const isLibrary = pathname.startsWith("/library") || pathname.startsWith("/songs");
  const isSettings = pathname.startsWith("/settings");

  return (
    <div className="flex-1 min-h-dvh flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/rehearsals" className="flex items-center gap-2 hover:opacity-90">
          <div className="w-8 h-8 rounded-xl bg-btn-bg border border-dialog-border flex items-center justify-center text-foreground font-black text-sm">
            BB
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-foreground leading-none">
              BandBoard
            </h1>
            <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5b80a5] animate-ping" /> Live
              Setlist Sync
            </span>
          </div>
        </Link>

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
      </header>

      <main className="flex-1 w-full max-w-none px-4 md:px-8 py-6 pb-16 md:pb-6 space-y-6">
        {children}
      </main>

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
    </div>
  );
}
