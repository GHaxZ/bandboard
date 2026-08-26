"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Edit,
  Sliders,
  ListMusic,
  Trash2,
  Vote as VoteIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientDate } from "./ClientDate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteRehearsal } from "@/app/actions/rehearsals";

interface RehearsalHeaderProps {
  rehearsalId: string;
  title: string;
  date: number;
  activeTab: "setlist" | "kanban";
  onEdit: () => void;
  /** Present on manual sessions / finished votes → offers re-voting. */
  onConvertToVote?: () => void;
}

/** Title/date header + Edit action + tab switcher, shared by the rehearsal
 *  detail and kanban clients. Delete is a self-contained trash icon with
 *  confirmation, mirroring the song-details page. */
export function RehearsalHeader({
  rehearsalId,
  title,
  date,
  activeTab,
  onEdit,
  onConvertToVote,
}: RehearsalHeaderProps) {
  const router = useRouter();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
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

  return (
    <>
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
              {title}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              <ClientDate ms={date} variant="datetime" />
            </p>
          </div>
        </div>

        {/* flex-wrap: labeled buttons overflow narrow phones otherwise */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onConvertToVote && (
            <Button
              variant="secondary"
              onClick={onConvertToVote}
              className="rounded-xl text-xs font-bold px-3.5 h-9"
            >
              <VoteIcon className="w-3.5 h-3.5 mr-1" /> Start Vote
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={onEdit}
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
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 bg-card border border-border p-1 rounded-xl w-fit">
        <Link
          href={`/rehearsals/${rehearsalId}`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
            activeTab === "setlist"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ListMusic className="w-4 h-4" />
          Setlist &amp; Practice
        </Link>
        <Link
          href={`/rehearsals/${rehearsalId}/kanban`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
            activeTab === "kanban"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sliders className="w-4 h-4" />
          Kanban Board
        </Link>
      </div>

      <ConfirmDialog
        isOpen={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete this rehearsal?"
        description="The rehearsal with its setlist, votes and comments will be permanently removed."
        confirmLabel="Delete Session"
        destructive
        loading={isDeleting}
      />
    </>
  );
}
