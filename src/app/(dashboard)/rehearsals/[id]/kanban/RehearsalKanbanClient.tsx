"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { RehearsalHeader } from "@/components/RehearsalHeader";
import { EditRehearsalModal } from "@/components/EditRehearsalModal";
import { deleteRehearsal, getRehearsalDetails } from "@/app/actions/rehearsals";
import { getProgressMap, saveSongProgress } from "@/app/actions/user";
import type { RehearsalDetails, ProgressMap } from "@/types/models";
import { DEFAULT_PROGRESS } from "@/types/models";
import type { Role, ProgressStatus } from "@/lib/constants";

// DnD is client-only; avoid SSR hydration mismatch (PLAN §3.5 r).
const KanbanBoard = dynamic(
  () => import("@/components/KanbanBoard").then((m) => m.KanbanBoard),
  { ssr: false, loading: () => null }
);

interface RehearsalKanbanClientProps {
  rehearsalId: string;
  initialDetails: RehearsalDetails;
  preferredInstrument: Role;
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
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgressMap);

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
      try {
        const res = await deleteRehearsal(rehearsalId);
        if (res.success) router.push("/rehearsals");
        else toast.error("Failed to delete: " + (res.error ?? "unknown error"));
      } catch (err) {
        console.error(err);
        toast.error("Failed to delete rehearsal");
      }
    }
  }

  return (
    <div className="space-y-6">
      <RehearsalHeader
        rehearsalId={rehearsalId}
        title={rehearsalDetails.title}
        date={rehearsalDetails.date}
        activeTab="kanban"
        onEdit={() => setIsEditRehearsalOpen(true)}
        onDelete={handleDeleteRehearsal}
      />

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
          rehearsalSongs={rehearsalDetails.rehearsalSongs}
          progressMap={progressMap}
          preferredInstrument={preferredInstrument}
          onSaveProgress={async (songId, status) => {
            const oldProgress = progressMap[songId] ?? { ...DEFAULT_PROGRESS };
            // Optimistic update in functional form — reading the render-closure
            // map meant a second drag discarded the first's optimistic state.
            setProgressMap((prev) => ({
              ...prev,
              [songId]: { ...oldProgress, status: status as ProgressStatus },
            }));
            try {
              const res = await saveSongProgress(songId, { status: status as ProgressStatus });
              if (!res.success) {
                toast.error("Failed to save progress: " + res.error);
                // Explicit rollback (the refetch below would mask it only if it
                // succeeds).
                setProgressMap((prev) => ({ ...prev, [songId]: oldProgress }));
              }
            } catch (err) {
              // Server-action RPC failure rejects rather than returning
              // {success:false} — roll back here too or the optimistic state
              // sticks and persistStatus's saving-lock never sees the error.
              console.error(err);
              toast.error("Failed to save progress");
              setProgressMap((prev) => ({ ...prev, [songId]: oldProgress }));
            }
            refreshData();
          }}
          onSelectSong={(songId) => router.push(`/rehearsals/${rehearsalId}?song=${songId}`)}
          onPracticeSong={(songId) => router.push(`/songs/${songId}/practice`)}
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
