"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import {
  ArrowLeft,
  Edit,
  FileText,
  Hourglass,
  Music as MusicIcon,
  Trash2,
  Vote as VoteIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RehearsalTypeBadge } from "@/components/RehearsalTypeBadge";
import { EditRehearsalModal } from "@/components/EditRehearsalModal";
import { VotingPanel } from "@/components/VotingPanel";
import { SongDashboard } from "@/components/SongDashboard";
import { OriginalSongDashboard } from "@/components/OriginalSongDashboard";
import { ClientDate } from "@/components/ClientDate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteRehearsal } from "@/app/actions/rehearsals";
import { getSongs } from "@/app/actions/songs";
import { getProgressMap } from "@/app/actions/user";
import {
  endVotingNow,
  getVotingState,
  nominateSong,
  removeNomination,
  toggleVote,
} from "@/app/actions/votes";
import type {
  ProgressMap,
  Song,
  VotingCandidate,
  VotingState,
} from "@/types/models";
import type { Role } from "@/lib/constants";
import { formatTimeLeft } from "@/lib/utils";

interface VotingClientProps {
  rehearsalId: string;
  initialState: VotingState;
  songsList: Song[];
  preferredInstrument: Role;
  initialProgressMap: ProgressMap;
  currentUserId: string;
  currentUsername: string;
}

export function VotingClient({
  rehearsalId,
  initialState,
  songsList,
  preferredInstrument,
  initialProgressMap,
  currentUserId,
  currentUsername,
}: VotingClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState<VotingState>(initialState);
  const [songs, setSongs] = useState<Song[]>(songsList);
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgressMap);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Countdown tick (30s is plenty for minute-precision labels).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const votingClosed =
    !!state.finalizedAt || state.votingEndsAt <= now;

  const refreshVotingState = useCallback(async (): Promise<VotingState | null> => {
    const fresh = await getVotingState(rehearsalId);
    if (fresh) setState(fresh);
    return fresh;
  }, [rehearsalId]);

  const refreshedRef = useRef(false);

  // Live updates via SSE: the server checks every 2s and pushes only on
  // change, so votes/comments/nominations from other members appear within
  // ~2s. EventSource reconnects on its own if the connection drops.
  useEffect(() => {
    if (votingClosed) return;
    const es = new EventSource(`/api/rehearsals/${rehearsalId}/voting-stream`);
    es.onmessage = (e) => {
      try {
        const fresh = JSON.parse(e.data) as VotingState | null;
        if (!fresh || fresh.finalizedAt) {
          // Vote just ended somewhere else — swap to the rehearsal view.
          es.close();
          if (!refreshedRef.current) {
            refreshedRef.current = true;
            router.refresh();
          }
          return;
        }
        setState(fresh);
      } catch (err) {
        console.error("Failed to parse voting stream message:", err);
      }
    };
    return () => es.close();
  }, [rehearsalId, votingClosed, router]);

  // Local countdown hit zero → let the server finalize and re-render.
  useEffect(() => {
    if (state.votingEndsAt <= Date.now() && !refreshedRef.current) {
      refreshedRef.current = true;
      router.refresh();
    }
  }, [state.votingEndsAt, router]);

  const activeSongId = searchParams.get("song") || state.candidates[0]?.song.id || null;

  function handleSelectSong(songId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("song", songId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function patchCandidate(songId: string, patch: Partial<VotingCandidate>) {
    setState((prev) => ({
      ...prev,
      candidates: prev.candidates.map((c) =>
        c.song.id === songId ? { ...c, ...patch } : c
      ),
    }));
  }

  function handleToggleVote(songId: string) {
    const candidate = state.candidates.find((c) => c.song.id === songId);
    if (!candidate) return;
    const wasVoted = candidate.votedByMe;
    // Optimistic flip; rolled back if the server rejects.
    patchCandidate(songId, {
      votedByMe: !wasVoted,
      voteCount: candidate.voteCount + (wasVoted ? -1 : 1),
    });
    toggleVote(rehearsalId, songId)
      .then((res) => {
        if (!res.success) {
          patchCandidate(songId, { votedByMe: wasVoted, voteCount: candidate.voteCount });
          toast.error(res.error ?? "Failed to vote");
        }
      })
      .catch((err) => {
        console.error(err);
        patchCandidate(songId, { votedByMe: wasVoted, voteCount: candidate.voteCount });
        toast.error("Failed to vote");
      });
  }

  async function handleNominate(songId: string) {
    const res = await nominateSong(rehearsalId, songId);
    if (res.success) await refreshVotingState();
    else toast.error("Failed to add song: " + (res.error ?? "unknown error"));
  }

  async function handleRemoveNomination(songId: string) {
    setPendingRemoveId(null);
    const res = await removeNomination(rehearsalId, songId);
    if (!res.success) {
      toast.error("Failed to remove song: " + (res.error ?? "unknown error"));
      return;
    }
    // Optimistic removal; refreshVotingState() reconciles.
    setState((prev) => ({
      ...prev,
      candidates: prev.candidates.filter((c) => c.song.id !== songId),
    }));
    if (activeSongId === songId) {
      const remaining = state.candidates.filter((c) => c.song.id !== songId);
      const params = new URLSearchParams(searchParams.toString());
      if (remaining.length > 0) params.set("song", remaining[0].song.id);
      else params.delete("song");
      router.replace(`${pathname}?${params.toString()}`);
    }
    await refreshVotingState();
  }

  async function handleEndVoting() {
    setConfirmEndOpen(false);
    const res = await endVotingNow(rehearsalId);
    if (res.success) {
      toast.success("Voting closed");
      router.refresh(); // server finalizes + renders the rehearsal view
    } else {
      toast.error("Failed to end voting: " + (res.error ?? "unknown error"));
    }
  }

  async function handleDeleteRehearsal() {
    setConfirmDeleteOpen(false);
    setIsDeleting(true);
    try {
      const res = await deleteRehearsal(rehearsalId);
      if (res.success) router.push("/rehearsals");
      else toast.error("Failed to delete: " + (res.error ?? "unknown error"));
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete rehearsal");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRefreshAll() {
    const [freshSongs, freshProgress] = await Promise.all([
      getSongs(),
      getProgressMap(),
      refreshVotingState(),
    ]);
    setSongs(freshSongs);
    setProgressMap(freshProgress);
  }

  const selectedCandidate = activeSongId
    ? state.candidates.find((c) => c.song.id === activeSongId)
    : undefined;
  const currentSong = selectedCandidate?.song;

  const timeLeft = formatTimeLeft(state.votingEndsAt - now);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/rehearsals"
            className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card rounded-xl w-10 h-10 transition-all border border-transparent hover:border-border"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
              {state.title}
              <RehearsalTypeBadge rehearsalType="vote" />
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
              <Hourglass className="w-3 h-3" />
              {state.finalizedAt ? (
                <span>Voting closed</span>
              ) : (
                <>
                  <span>
                    Voting ends <ClientDate ms={state.votingEndsAt} variant="datetime" />
                  </span>
                  {timeLeft && (
                    <span className="font-bold text-violet-600 dark:text-violet-400">
                      · {timeLeft} left
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        {/* flex-wrap: labeled buttons overflow narrow phones otherwise */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!state.finalizedAt && (
            <Button
              variant="secondary"
              onClick={() => setConfirmEndOpen(true)}
              className="rounded-xl text-xs font-bold px-3.5 h-9"
            >
              <VoteIcon className="w-3.5 h-3.5 mr-1" /> End Vote
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => setIsEditOpen(true)}
            className="rounded-xl text-xs font-bold px-3.5 h-9"
          >
            <Edit className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
          <Button
            variant="danger-subtle"
            size="icon"
            disabled={isDeleting}
            onClick={() => setConfirmDeleteOpen(true)}
            className="rounded-xl h-9 w-9 shrink-0"
            title="Delete Session"
            aria-label="Delete Session"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {state.notes && (
          <div className="bg-card/40 border border-border rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-muted-foreground">
            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-foreground block mb-0.5 uppercase tracking-wide text-[10px]">
                Session Notes
              </span>
              {state.notes}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 bg-card/40 border border-border rounded-2xl p-4 shadow-lg h-fit">
            <VotingPanel
              rehearsalId={rehearsalId}
              candidates={state.candidates}
              allSongs={songs}
              activeSongId={activeSongId}
              votingOpen={!votingClosed}
              songSelectionCount={state.songSelectionCount}
              currentUserId={currentUserId}
              currentUsername={currentUsername}
              preferredInstrument={preferredInstrument}
              progressMap={progressMap}
              onSelectSong={handleSelectSong}
              onToggleVote={handleToggleVote}
              onNominate={handleNominate}
              onRequestRemoveNomination={(songId) => setPendingRemoveId(songId)}
              onCommentCountChange={(songId, delta) => {
                const c = state.candidates.find((c) => c.song.id === songId);
                if (c) patchCandidate(songId, { commentCount: c.commentCount + delta });
              }}
              onCommentsRead={(songId) => patchCandidate(songId, { hasUnreadComments: false })}
            />
          </div>

          <div className="lg:col-span-8">
            {(() => {
              if (!currentSong) {
                return (
                  <div className="text-center py-20 bg-card/40 border border-border rounded-2xl p-6 text-muted-foreground">
                    <MusicIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40 animate-pulse" />
                    <h3 className="font-semibold text-muted-foreground">No Song Selected</h3>
                    <p className="text-xs mt-1">
                      Select a nominated song on the left to view its details, tracks and backing
                      players.
                    </p>
                  </div>
                );
              }
              if (currentSong.songType === "original") {
                return (
                  <OriginalSongDashboard
                    song={currentSong}
                    onRefresh={handleRefreshAll}
                    onDelete={
                      votingClosed
                        ? undefined
                        : () => setPendingRemoveId(currentSong.id)
                    }
                    deleteTitle="Remove nomination (and its votes/comments)"
                    onPractice={() => router.push(`/songs/${currentSong.id}/practice`)}
                    onEdit={() => router.push(`/songs/${currentSong.id}/edit`)}
                    preferredInstrument={preferredInstrument}
                  />
                );
              }
              return (
                <SongDashboard
                  song={currentSong}
                  onRefresh={handleRefreshAll}
                  onDelete={
                    votingClosed
                      ? undefined
                      : () => setPendingRemoveId(currentSong.id)
                  }
                  deleteTitle="Remove nomination (and its votes/comments)"
                  onPractice={() => router.push(`/songs/${currentSong.id}/practice`)}
                  preferredInstrument={preferredInstrument}
                />
              );
            })()}
          </div>
        </div>
      </div>

      <EditRehearsalModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        rehearsal={{
          id: state.id,
          title: state.title,
          date: state.date,
          notes: state.notes,
        }}
        voting={
          state.finalizedAt
            ? null
            : { votingEndsAt: state.votingEndsAt, songSelectionCount: state.songSelectionCount }
        }
        onSuccess={refreshVotingState}
      />

      <ConfirmDialog
        isOpen={confirmEndOpen}
        onClose={() => setConfirmEndOpen(false)}
        onConfirm={handleEndVoting}
        title="End this voting early?"
        description={`The top ${state.songSelectionCount} voted songs (plus ties at the cut-off) will become the rehearsal setlist. This cannot be undone.`}
        confirmLabel="End Voting"
        cancelLabel="Keep Voting"
      />

      <ConfirmDialog
        isOpen={pendingRemoveId !== null}
        onClose={() => setPendingRemoveId(null)}
        onConfirm={() => pendingRemoveId && handleRemoveNomination(pendingRemoveId)}
        title="Remove this nomination?"
        description="The song, all votes cast for it, and its comment thread will be removed from this vote."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
      />

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDeleteRehearsal}
        title="Delete this voting?"
        description="The voting session with all nominations, votes and comments will be permanently removed."
        confirmLabel="Delete Session"
        destructive
        loading={isDeleting}
      />
    </div>
  );
}
