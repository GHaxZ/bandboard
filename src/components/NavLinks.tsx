"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Music as MusicIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/rehearsals", label: "Rehearsals", shortLabel: "Rehearsals", icon: CalendarIcon },
  { href: "/library", label: "Song Library", shortLabel: "Library", icon: MusicIcon },
  { href: "/settings", label: "Settings", shortLabel: "Settings", icon: SettingsIcon },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/library") return pathname.startsWith("/library") || pathname.startsWith("/songs");
  return pathname.startsWith(href);
}

/**
 * Client island for the dashboard nav + mobile footer — the only reason the
 * layout used to be a client component.
 */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      <nav className="hidden md:flex items-center gap-1.5 bg-card border border-border p-1 rounded-xl">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="w-4 h-4" /> {label}
            </Link>
          );
        })}
      </nav>

      <footer className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card/90 backdrop-blur-lg border-t border-border px-6 py-2 flex items-center justify-around shadow-2xl">
        {LINKS.map(({ href, shortLabel, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center gap-1 pt-1 pb-0.5 px-3 font-bold text-[10px] transition-all duration-200",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-5 h-5" />
              {shortLabel}
              <span
                className={cn(
                  "absolute -top-2 inset-x-2 h-0.5 rounded-full bg-primary transition-opacity duration-200",
                  active ? "opacity-100" : "opacity-0"
                )}
              />
            </Link>
          );
        })}
      </footer>
    </>
  );
}
