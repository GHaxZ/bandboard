"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar as CalendarIcon, Music as MusicIcon, Plus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddRehearsalModal } from "@/components/AddRehearsalModal";
import { ClientDate } from "@/components/ClientDate";
import { EmptyState } from "@/components/EmptyState";
import { getRehearsals } from "@/app/actions/rehearsals";
import type { Rehearsal } from "@/types/models";

interface RehearsalsDashboardProps {
  initialRehearsals: Rehearsal[];
}

export function RehearsalsDashboard({ initialRehearsals }: RehearsalsDashboardProps) {
  const router = useRouter();
  const [rehearsalsList, setRehearsalsList] = useState<Rehearsal[]>(initialRehearsals);
  const [isAddRehearsalOpen, setIsAddRehearsalOpen] = useState(false);
  const [, startTransition] = useTransition();

  async function refreshData() {
    startTransition(async () => {
      const updated = await getRehearsals();
      setRehearsalsList(updated);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-foreground flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-muted-foreground" />
            Rehearsal Sessions
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Organize setlists and check instrument tracks during practice.
          </p>
        </div>
        <Button
          onClick={() => setIsAddRehearsalOpen(true)}
          className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl shadow-md font-bold text-xs"
        >
          <Plus className="w-4 h-4 mr-1" /> Schedule Prep
        </Button>
      </div>

      {rehearsalsList.length === 0 ? (
        <EmptyState
          icon={CalendarIcon}
          title="No Rehearsals Scheduled"
          description="Get started by creating a practice session and adding songs."
          action={
            <Button
              onClick={() => setIsAddRehearsalOpen(true)}
              className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl text-xs font-bold"
            >
              Schedule Your First Prep
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rehearsalsList.map((reh) => {
            return (
              <Link key={reh.id} href={`/rehearsals/${reh.id}`} className="block">
                <Card className="border-border bg-card/40 hover:bg-card/80 hover:border-[#383a3f] transition-all duration-200 cursor-pointer rounded-2xl overflow-hidden group shadow-lg py-0 h-full flex flex-col justify-between">
                  <CardHeader className="p-5 pb-3">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">
                      <ClientDate ms={reh.date} variant="date" />
                    </span>
                    <CardTitle className="text-base font-bold text-foreground mt-1 line-clamp-1 group-hover:text-foreground">
                      {reh.title}
                    </CardTitle>
                    {reh.notes && (
                      <CardDescription className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {reh.notes}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="px-5 pb-5 pt-0 flex items-center justify-between text-xs text-muted-foreground border-t border-border/60 mt-3 pt-3">
                    <span className="flex items-center gap-1 font-semibold text-muted-foreground">
                      <MusicIcon className="w-3.5 h-3.5 text-muted-foreground" />{" "}
                      {reh.rehearsalSongs?.length || 0} songs
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />{" "}
                      <ClientDate ms={reh.date} variant="time" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <AddRehearsalModal
        isOpen={isAddRehearsalOpen}
        onClose={() => setIsAddRehearsalOpen(false)}
        onSuccess={(id) => {
          refreshData();
          router.push(`/rehearsals/${id}`);
        }}
      />
    </div>
  );
}
