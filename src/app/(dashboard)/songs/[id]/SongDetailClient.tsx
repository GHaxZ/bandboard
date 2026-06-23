"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SongDashboard } from "@/components/SongDashboard";
import { deleteSong, getSongDetails } from "@/app/actions/songs";
import { getUserSettings } from "@/app/actions/user";
import { Song } from "@/types/models";

interface SongDetailClientProps {
  songId: string;
  initialSong: Song;
  preferredInstrument: string;
}

export function SongDetailClient({ songId, initialSong, preferredInstrument }: SongDetailClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [song, setSong] = useState<Song>(initialSong);
  const [instrument, setInstrument] = useState(preferredInstrument);

  async function refreshData() {
    startTransition(async () => {
      const updated = await getSongDetails(songId);
      if (updated) {
        setSong(updated);
      }
    });
  }

  async function handleDeleteSong() {
    if (confirm("Are you sure you want to delete this song and all its associated notation/media tracks?")) {
      const res = await deleteSong(songId);
      if (res.success) {
        router.push("/library");
      }
    }
  }

  // Get active role from URL parameter, fallback to preferred instrument
  const activeRole = searchParams.get("role") || instrument || "Guitar";

  function handleRoleChange(newRole: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("role", newRole.toLowerCase());
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-border pb-5">
        <Link
          href="/library"
          className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card rounded-xl w-10 h-10 transition-all border border-transparent hover:border-border"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-lg font-black text-foreground">Library Details</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Inspect and customize tracks for this song.
          </p>
        </div>
      </div>

      <SongDashboard
        song={song}
        onRefresh={refreshData}
        onDelete={handleDeleteSong}
        onPractice={() => router.push(`/songs/${songId}/practice`)}
        preferredInstrument={instrument}
        activeRole={activeRole}
        onRoleChange={handleRoleChange}
      />
    </div>
  );
}
