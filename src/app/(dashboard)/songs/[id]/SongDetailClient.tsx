"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { SongDashboard } from "@/components/SongDashboard";
import { OriginalSongDashboard } from "@/components/OriginalSongDashboard";
import { deleteSong, getSongDetails } from "@/app/actions/songs";
import type { Song } from "@/types/models";
import type { Role } from "@/lib/constants";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface SongDetailClientProps {
  songId: string;
  initialSong: Song;
  preferredInstrument: Role;
}

export function SongDetailClient({
  songId,
  initialSong,
  preferredInstrument,
}: SongDetailClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [song, setSong] = useState<Song>(initialSong);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  async function refreshData() {
    startTransition(async () => {
      const updated = await getSongDetails(songId);
      if (updated) setSong(updated);
    });
  }

  async function handleDeleteSong() {
    setConfirmDeleteOpen(false);
    try {
      const res = await deleteSong(songId);
      if (res.success) router.push("/library");
      else toast.error("Failed to delete: " + (res.error ?? "unknown error"));
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete song");
    }
  }

  const activeRole = searchParams.get("role") || preferredInstrument || "Guitar";

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
          aria-label="Back to library"
          className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card rounded-xl w-10 h-10 transition-all border border-transparent hover:border-border"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h2 className="text-lg font-heading font-bold text-foreground">Library Details</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Inspect and customize tracks for this song.
          </p>
        </div>
      </div>

      {song.songType === "original" ? (
        <OriginalSongDashboard
          song={song}
          onRefresh={refreshData}
          onDelete={() => setConfirmDeleteOpen(true)}
          onPractice={() => router.push(`/songs/${songId}/practice`)}
          onEdit={() => router.push(`/songs/${songId}/edit`)}
          preferredInstrument={preferredInstrument}
        />
      ) : (
        <SongDashboard
          song={song}
          onRefresh={refreshData}
          onDelete={() => setConfirmDeleteOpen(true)}
          onPractice={() => router.push(`/songs/${songId}/practice`)}
          preferredInstrument={preferredInstrument}
          activeRole={activeRole}
          onRoleChange={handleRoleChange}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDeleteSong}
        title="Delete this song?"
        description="The song and all its associated notation and media tracks will be permanently removed."
        confirmLabel="Delete Song"
        destructive
      />
    </div>
  );
}
