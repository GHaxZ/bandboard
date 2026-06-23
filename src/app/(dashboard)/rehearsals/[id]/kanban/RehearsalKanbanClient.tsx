"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  ArrowLeft,
  Edit,
  Sliders,
  ListMusic,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/KanbanBoard";
import { PrivateIndicator } from "@/components/PrivateIndicator";
import { EditRehearsalModal } from "@/components/EditRehearsalModal";
import { deleteRehearsal, getRehearsalDetails } from "@/app/actions/rehearsals";
import { getUserSettings, getAllSongProgress, saveSongProgress } from "@/app/actions/user";
import { RehearsalDetails, ProgressMap } from "@/types/models";

interface RehearsalKanbanClientProps {
  rehearsalId: string;
  initialDetails: RehearsalDetails;
  preferredInstrument: string;
  initialProgressMap: ProgressMap;
}

export function RehearsalKanbanClient({
  rehearsalId,
  initialDetails,
  preferredInstrument,
  initialProgressMap,
}: RehearsalKanbanClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [rehearsalDetails, setRehearsalDetails] = useState<RehearsalDetails>(initialDetails);
  const [isEditRehearsalOpen, setIsEditRehearsalOpen] = useState(false);
  const [instrument, setInstrument] = useState(preferredInstrument);
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgressMap);

  useEffect(() => {
    // No longer need client-side data loader on mount as progressMap is loaded server-side!
  }, []);

  async function refreshData() {
    startTransition(async () => {
      const details = await getRehearsalDetails(rehearsalId);
      if (details) {
        setRehearsalDetails(details);
      }
      const progressList = await getAllSongProgress();
      const map: ProgressMap = {};
      progressList.forEach((p) => {
        map[p.songId] = {
          status: p.status,
          speed: p.speed,
          notes: p.notes,
          practiceMarkers: p.practiceMarkers,
          backingStartOffset: p.backingStartOffset,
          tabStartOffset: p.tabStartOffset,
        };
      });
      setProgressMap(map);
    });
  }

  async function handleDeleteRehearsal() {
    if (confirm("Are you sure you want to delete this rehearsal prep session?")) {
      const res = await deleteRehearsal(rehearsalId);
      if (res.success) {
        router.push("/rehearsals");
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Back Link Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/rehearsals"
            className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card rounded-xl w-10 h-10 transition-all border border-transparent hover:border-border"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h2 className="text-xl font-black text-foreground flex items-center gap-2">
              {rehearsalDetails.title}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(rehearsalDetails.date).toLocaleString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setIsEditRehearsalOpen(true)}
            className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl text-xs font-bold px-3.5 h-9"
          >
            <Edit className="w-3.5 h-3.5 mr-1" /> Edit Details
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteRehearsal}
            className="bg-red-950/25 hover:bg-red-900/40 border border-red-950/40 text-red-400 hover:text-white rounded-xl text-xs font-bold px-3.5 h-9"
          >
            Delete Session
          </Button>
        </div>
      </div>

      {/* Rehearsal Tabs / View Mode Switcher */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-card border border-border p-1 rounded-xl w-fit">
          <Link
            href={`/rehearsals/${rehearsalId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 text-muted-foreground hover:text-foreground"
          >
            <ListMusic className="w-4 h-4" />
            Setlist & Practice
          </Link>
          <Link
            href={`/rehearsals/${rehearsalId}/kanban`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 bg-muted text-foreground"
          >
            <Sliders className="w-4 h-4" />
            Kanban Board
          </Link>
        </div>

        <PrivateIndicator
          text="Only synced for you"
          tooltip="Your practice progress and notes are kept private to your user session."
        />
      </div>

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

      <div className="flex-1 min-h-0">
        <KanbanBoard
          rehearsalId={rehearsalDetails.id}
          rehearsalSongs={rehearsalDetails.rehearsalSongs}
          progressMap={progressMap}
          onSaveProgress={async (songId, status) => {
            const oldProgress = progressMap[songId] || { speed: 100, notes: null };
            setProgressMap({
              ...progressMap,
              [songId]: {
                ...oldProgress,
                status,
              },
            });
            const res = await saveSongProgress(songId, status, oldProgress.speed, oldProgress.notes);
            if (!res.success) {
              toast.error("Failed to save progress: " + res.error);
            }
            refreshData();
          }}
          onSelectSong={(songId) => {
            router.push(`/rehearsals/${rehearsalId}?song=${songId}`);
          }}
          onPracticeSong={(songId) => {
            router.push(`/songs/${songId}/practice`);
          }}
          preferredInstrument={instrument}
        />
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
