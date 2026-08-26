"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Music as MusicIcon,
  FileText,
} from "lucide-react";
import { RehearsalHeader } from "@/components/RehearsalHeader";
import { EditRehearsalModal } from "@/components/EditRehearsalModal";
import { ConvertToVoteModal } from "@/components/ConvertToVoteModal";
import { SetlistManager } from "@/components/SetlistManager";
import { SongDashboard } from "@/components/SongDashboard";
import { OriginalSongDashboard } from "@/components/OriginalSongDashboard";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  getRehearsalDetails,
  removeSongFromRehearsalSetlist,
} from "@/app/actions/rehearsals";
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

  const [rehearsalDetails, setRehearsalDetails] = useState<RehearsalDetails>(initialDetails);
  const [isEditRehearsalOpen, setIsEditRehearsalOpen] = useState(false);
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgressMap);

  // Manual sessions AND finished votes can (re-)start a voting. Open votes
  // render VotingClient instead of this component, so they never get here.
  const canConvertToVote =
    rehearsalDetails.type === "manual" || !!rehearsalDetails.finalizedAt;

  const activeSongId =
    searchParams.get("song") || rehearsalDetails.rehearsalSongs[0]?.songId || null;

  async function refreshData() {
    const details = await getRehearsalDetails(rehearsalId);
    if (details) setRehearsalDetails(details);
    const map = await getProgressMap();
    setProgressMap(map);
  }

  // Self-heal a stale ?song= (song removed from setlist / dead bookmark):
  // once the fresh list lands, point the URL at the song actually displayed.
  useEffect(() => {
    const requested = searchParams.get("song");
    if (!requested) return;
    if (rehearsalDetails.rehearsalSongs.some((rs) => rs.songId === requested)) return;
    const params = new URLSearchParams(searchParams.toString());
    const first = rehearsalDetails.rehearsalSongs[0]?.songId;
    if (first) params.set("song", first);
    else params.delete("song");
    router.replace(`${pathname}?${params.toString()}`);
  }, [searchParams, rehearsalDetails.rehearsalSongs, pathname, router]);

  function handleSelectSong(songId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("song", songId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  // Trash in the list or the song-info pane opens a confirm dialog (same
  // flow as the voting view), then runs this mirrored removal.
  async function handleRemoveFromSetlist(songId: string) {
    setPendingRemoveId(null);
    const res = await removeSongFromRehearsalSetlist(rehearsalId, songId);
    if (!res.success) {
      toast.error("Failed to remove song: " + res.error);
      return;
    }
    // Optimistic: drop it from local state now; refreshData() reconciles.
    // The self-heal effect repairs a stale ?song= pointing at the removed song.
    setRehearsalDetails((prev) => ({
      ...prev,
      rehearsalSongs: prev.rehearsalSongs.filter((rs) => rs.songId !== songId),
    }));
    await refreshData();
  }

  return (
    <div className="space-y-6">
      <RehearsalHeader
        rehearsalId={rehearsalId}
        title={rehearsalDetails.title}
        date={rehearsalDetails.date}
        activeTab="setlist"
        onEdit={() => setIsEditRehearsalOpen(true)}
        onConvertToVote={canConvertToVote ? () => setIsConvertOpen(true) : undefined}
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
              onRequestRemoveSong={(songId) => setPendingRemoveId(songId)}
              progressMap={progressMap}
              onPracticeSong={(songId) => router.push(`/songs/${songId}/practice`)}
              onStartAutoplay={() => router.push(`/rehearsals/${rehearsalId}/practice`)}
              preferredInstrument={preferredInstrument}
            />
          </div>

          <div className="lg:col-span-8">
            {(() => {
              // Explicit ?song= wins when valid; a stale or missing one falls
              // back to the first song (the heal effect repairs the URL).
              // Only a genuinely EMPTY setlist renders the empty state.
              const currentRehSong =
                rehearsalDetails.rehearsalSongs.find(
                  (rs) => rs.songId === activeSongId
                ) ?? rehearsalDetails.rehearsalSongs[0];
              if (!currentRehSong) {
                return (
                  <div className="text-center py-20 bg-card/40 border border-border rounded-2xl p-6 text-muted-foreground">
                    <MusicIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40 animate-pulse" />
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
                    onDelete={() => setPendingRemoveId(currentSong.id)}
                    deleteTitle="Remove from Setlist"
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
                  onDelete={() => setPendingRemoveId(currentSong.id)}
                  deleteTitle="Remove from Setlist"
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

      <ConvertToVoteModal
        isOpen={isConvertOpen}
        onClose={() => setIsConvertOpen(false)}
        rehearsal={{
          id: rehearsalDetails.id,
          title: rehearsalDetails.title,
          date: rehearsalDetails.date,
          notes: rehearsalDetails.notes,
          votingEndsAt: rehearsalDetails.votingEndsAt,
          songSelectionCount: rehearsalDetails.songSelectionCount,
        }}
        onSuccess={() => {
          // Server now classifies this as an open vote — hard swap to the
          // voting view. router.refresh() intermittently lost the race.
          window.location.reload();
        }}
      />

      <ConfirmDialog
        isOpen={pendingRemoveId !== null}
        onClose={() => setPendingRemoveId(null)}
        onConfirm={() => pendingRemoveId && handleRemoveFromSetlist(pendingRemoveId)}
        title="Remove this song from the setlist?"
        description="The song will be removed from this session's setlist. It stays in your library."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
      />

    </div>
  );
}
