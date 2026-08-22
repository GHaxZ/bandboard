"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Music as MusicIcon,
  FileText,
} from "lucide-react";
import { RehearsalHeader } from "@/components/RehearsalHeader";
import { EditRehearsalModal } from "@/components/EditRehearsalModal";
import { SetlistManager } from "@/components/SetlistManager";
import { SongDashboard } from "@/components/SongDashboard";
import { OriginalSongDashboard } from "@/components/OriginalSongDashboard";
import { deleteRehearsal, getRehearsalDetails } from "@/app/actions/rehearsals";
import { getProgressMap } from "@/app/actions/user";
import type { RehearsalDetails, Song, ProgressMap } from "@/types/models";
import type { Role } from "@/lib/constants";

interface RehearsalDetailClientProps {
  rehearsalId: string;
  initialDetails: RehearsalDetails;
  songsList: Song[];
  preferredInstrument: Role;
  initialProgressMap: ProgressMap;
}

export function RehearsalDetailClient({
  rehearsalId,
  initialDetails,
  songsList,
  preferredInstrument,
  initialProgressMap,
}: RehearsalDetailClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [rehearsalDetails, setRehearsalDetails] = useState<RehearsalDetails>(initialDetails);
  const [isEditRehearsalOpen, setIsEditRehearsalOpen] = useState(false);
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgressMap);

  const activeSongId =
    searchParams.get("song") || rehearsalDetails.rehearsalSongs[0]?.songId || null;

  async function refreshData() {
    startTransition(async () => {
      const details = await getRehearsalDetails(rehearsalId);
      if (details) setRehearsalDetails(details);
      const map = await getProgressMap();
      setProgressMap(map);
    });
  }

  async function handleDeleteRehearsal() {
    if (confirm("Are you sure you want to delete this rehearsal prep session?")) {
      const res = await deleteRehearsal(rehearsalId);
      if (res.success) router.push("/rehearsals");
    }
  }

  function handleSelectSong(songId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("song", songId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <RehearsalHeader
        rehearsalId={rehearsalId}
        title={rehearsalDetails.title}
        date={rehearsalDetails.date}
        activeTab="setlist"
        onEdit={() => setIsEditRehearsalOpen(true)}
        onDelete={handleDeleteRehearsal}
      />

      <div className="space-y-6">
        {rehearsalDetails.notes && (
          <div className="bg-card/40 border border-border rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-muted-foreground">
            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-foreground block mb-0.5 uppercase tracking-wide text-[10px]">
                Session Notes
              </span>
              {rehearsalDetails.notes}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-card/40 border border-border rounded-2xl p-4 shadow-lg h-fit">
            <SetlistManager
              rehearsalId={rehearsalDetails.id}
              rehearsalSongs={rehearsalDetails.rehearsalSongs}
              allSongs={songsList}
              activeSongId={activeSongId}
              onSelectSong={handleSelectSong}
              onRefresh={refreshData}
              progressMap={progressMap}
              onPracticeSong={(songId) => router.push(`/songs/${songId}/practice`)}
              onStartAutoplay={() => router.push(`/rehearsals/${rehearsalId}/practice`)}
              preferredInstrument={preferredInstrument}
            />
          </div>

          <div className="lg:col-span-8">
            {(() => {
              // A stale ?song= (removed from the setlist, dead bookmark) must
              // fall through to the empty state, not render a blank pane.
              const currentRehSong = activeSongId
                ? rehearsalDetails.rehearsalSongs.find(
                    (rs) => rs.songId === activeSongId
                  )
                : undefined;
              if (!currentRehSong) {
                return (
                  <div className="text-center py-20 bg-card/40 border border-border rounded-2xl p-6 text-muted-foreground">
                    <MusicIcon className="w-12 h-12 mx-auto mb-3 text-[#27282b] animate-pulse" />
                    <h3 className="font-semibold text-muted-foreground">No Song Selected</h3>
                    <p className="text-xs mt-1">
                      Select a song from the setlist on the left to load its notations and backing
                      players.
                    </p>
                  </div>
                );
              }
              const currentSong = currentRehSong.song;
              if (currentSong.songType === "original") {
                return (
                  <OriginalSongDashboard
                    song={currentSong}
                    onRefresh={refreshData}
                    onPractice={() =>
                      router.push(`/songs/${currentSong.id}/practice`)
                    }
                    onEdit={() => router.push(`/songs/${currentSong.id}/edit`)}
                    preferredInstrument={preferredInstrument}
                  />
                );
              }
              return (
                <SongDashboard
                  song={currentSong}
                  onRefresh={refreshData}
                  onPractice={() =>
                    router.push(`/songs/${currentSong.id}/practice`)
                  }
                  preferredInstrument={preferredInstrument}
                />
              );
            })()}
          </div>
        </div>
      </div>

      <EditRehearsalModal
        isOpen={isEditRehearsalOpen}
        onClose={() => setIsEditRehearsalOpen(false)}
        rehearsal={rehearsalDetails}
        onSuccess={refreshData}
      />
    </div>
  );
}
