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

  // Active tab helper based on path
  const isRehearsals = pathname.startsWith("/rehearsals");
  const isLibrary = pathname.startsWith("/library") || pathname.startsWith("/songs");
  const isSettings = pathname.startsWith("/settings");

  const isKanban = pathname.endsWith("/kanban");
  const pbClass = isKanban ? "pb-20 md:pb-0" : "pb-20 md:pb-6";

  return (
    <div className={cn("flex-1 flex flex-col bg-background text-foreground", pbClass)}>
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/rehearsals" className="flex items-center gap-2 hover:opacity-90">
          <div className="w-8 h-8 rounded-xl bg-btn-bg border border-dialog-border flex items-center justify-center text-foreground font-black text-sm">
            BB
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight text-foreground leading-none">BandBoard</h1>
            <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5b80a5] animate-ping"></span> Live Setlist Sync
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1.5 bg-card border border-border p-1 rounded-xl">
          <Link
            href="/rehearsals"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200",
              isRehearsals ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarIcon className="w-4 h-4" /> Rehearsals
          </Link>
          <Link
            href="/library"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200",
              isLibrary ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MusicIcon className="w-4 h-4" /> Song Library
          </Link>
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200",
              isSettings ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <SettingsIcon className="w-4 h-4" /> Settings
          </Link>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className={cn("flex-1 w-full max-w-none px-4 md:px-8 py-6 space-y-6", isKanban && "pb-4 md:pb-0")}>
        {children}
      </main>

      {/* Sticky Bottom Navigation Bar for Mobile */}
      <footer className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/90 backdrop-blur-lg border-t border-border px-6 py-2.5 flex items-center justify-around shadow-2xl">
        <Link
          href="/rehearsals"
          className={cn(
            "flex flex-col items-center gap-1 py-1 font-bold text-[10px] transition-all duration-200",
            isRehearsals ? "text-foreground scale-105" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <CalendarIcon className="w-5 h-5" />
          Rehearsals
        </Link>
        <Link
          href="/library"
          className={cn(
            "flex flex-col items-center gap-1 py-1 font-bold text-[10px] transition-all duration-200",
            isLibrary ? "text-foreground scale-105" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <MusicIcon className="w-5 h-5" />
          Library
        </Link>
        <Link
          href="/settings"
          className={cn(
            "flex flex-col items-center gap-1 py-1 font-bold text-[10px] transition-all duration-200",
            isSettings ? "text-foreground scale-105" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <SettingsIcon className="w-5 h-5" />
          Settings
        </Link>
      </footer>
    </div>
  );
}
