"use client";

import { useEffect, useState } from "react";

// Server and first client render produce the same output (nothing), so
// hydration never mismatches. After mount, useEffect fires and we swap in
// the browser's native toLocaleString — driven entirely by the user's
// environment (their locale + timezone, e.g. de-AT / Europe/Vienna →
// "Fr, 3. Jul, 19:00"). One render flash only; stable after.

const OPTIONS = {
  date: { weekday: "short", month: "short", day: "numeric" } as const,
  time: { hour: "2-digit", minute: "2-digit" } as const,
  datetime: { weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } as const,
} as const;

export function ClientDate({
  ms,
  variant = "datetime",
}: {
  ms: number;
  variant?: keyof typeof OPTIONS;
}) {
  const [formatted, setFormatted] = useState<string | null>(null);
  useEffect(() => {
    setFormatted(new Date(ms).toLocaleString(undefined, OPTIONS[variant]));
  }, [ms, variant]);
  return <span>{formatted ?? ""}</span>;
}