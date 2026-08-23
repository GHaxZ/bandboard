"use client";

import Link from "next/link";
import { ArrowLeft, Edit, Sliders, ListMusic, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientDate } from "./ClientDate";

interface RehearsalHeaderProps {
  rehearsalId: string;
  title: string;
  date: number;
  activeTab: "setlist" | "kanban";
  onEdit: () => void;
  onDelete: () => void;
}

/** Title/date header + Edit/Delete actions + tab switcher, shared by the
 *  rehearsal detail and kanban clients. */
export function RehearsalHeader({
  rehearsalId,
  title,
  date,
  activeTab,
  onEdit,
  onDelete,
}: RehearsalHeaderProps) {
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

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={onEdit}
            className="rounded-xl text-xs font-bold px-3.5 h-9"
          >
            <Edit className="w-3.5 h-3.5 mr-1" /> Edit Details
          </Button>
          <Button
            variant="danger-subtle"
            onClick={onDelete}
            className="rounded-xl text-xs font-bold px-3.5 h-9"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Session
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
    </>
  );
}
