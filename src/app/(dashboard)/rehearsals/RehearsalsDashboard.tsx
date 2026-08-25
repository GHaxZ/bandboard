"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  Vote as VoteIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AddRehearsalModal } from "@/components/AddRehearsalModal";
import { ClientDate } from "@/components/ClientDate";
import { RehearsalTypeBadge } from "@/components/RehearsalTypeBadge";
import { Eyebrow } from "@/components/Eyebrow";
import { SearchInput } from "@/components/SearchInput";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import type { Rehearsal } from "@/types/models";
import type { RehearsalType } from "@/lib/constants";
import { formatTimeLeft } from "@/lib/utils";

interface RehearsalsDashboardProps {
  initialRehearsals: Rehearsal[];
}

export function RehearsalsDashboard({ initialRehearsals }: RehearsalsDashboardProps) {
  const router = useRouter();
  const [isAddRehearsalOpen, setIsAddRehearsalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<RehearsalType | "all">("all");
  // Ticks so vote countdowns on the cards stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // A finalized vote IS a normal rehearsal now — filter/display it as one.
  const displayTypeOf = (reh: Rehearsal): RehearsalType =>
    reh.type === "vote" && !reh.finalizedAt ? "vote" : "manual";

  const filteredRehearsals = initialRehearsals.filter((reh) => {
    if (typeFilter !== "all" && displayTypeOf(reh) !== typeFilter) return false;
    const q = searchQuery.toLowerCase();
    return (
      reh.title.toLowerCase().includes(q) || (reh.notes ?? "").toLowerCase().includes(q)
    );
  });

  const typeFilterOptions: { value: RehearsalType | "all"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "manual", label: "Sessions" },
    { value: "vote", label: "Votings" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        icon={CalendarIcon}
        title="Rehearsal Sessions"
        description="Organize setlists and check instrument tracks during practice."
        actions={
          <Button
            onClick={() => setIsAddRehearsalOpen(true)}
            variant="secondary"
            className="rounded-xl shadow-md font-bold text-xs"
          >
            <Plus className="w-4 h-4 mr-1" /> Schedule Prep
          </Button>
        }
      />

      <div className="flex items-center gap-1 rounded-xl bg-muted/30 border border-border p-1 w-fit">
        {typeFilterOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTypeFilter(opt.value)}
            className={
              typeFilter === opt.value
                ? "px-3 py-1 text-[11px] font-bold rounded-lg bg-btn-bg text-foreground border border-dialog-border"
                : "px-3 py-1 text-[11px] font-bold rounded-lg text-muted-foreground hover:text-foreground border border-transparent"
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      <SearchInput
        placeholder="Search rehearsals by title or notes..."
        value={searchQuery}
        onChange={setSearchQuery}
      />

      {filteredRehearsals.length === 0 ? (
        <EmptyState
          icon={CalendarIcon}
          title={initialRehearsals.length === 0 ? "No Rehearsals Scheduled" : "No Matches"}
          description={
            initialRehearsals.length === 0
              ? "Get started by creating a practice session or song vote."
              : "Try a different search or filter."
          }
          action={
            initialRehearsals.length === 0 ? (
              <Button
                onClick={() => setIsAddRehearsalOpen(true)}
                className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl text-xs font-bold"
              >
                Schedule Your First Prep
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRehearsals.map((reh) => {
            const displayType = displayTypeOf(reh);
            const voteOpen = displayType === "vote";
            const timeLeft = formatTimeLeft((reh.votingEndsAt ?? 0) - now);
            return (
              <Link key={reh.id} href={`/rehearsals/${reh.id}`} className="block h-full">
                {/* Mirrors SongCard's chrome exactly; only the type tag and
                    the voting timer carry color. */}
                <Card className="relative h-full flex flex-col justify-between border-border bg-card/40 hover:bg-card/80 hover:border-ring/30 hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200 cursor-pointer rounded-2xl overflow-hidden group shadow-lg py-0">
                  <CardHeader className="p-5 flex flex-row items-center gap-4">
                    <div className="w-12 h-12 rounded-xl border border-border flex items-center justify-center bg-muted/30 shrink-0">
                      {voteOpen ? (
                        <VoteIcon className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <CalendarIcon className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <Eyebrow>
                          {voteOpen
                            ? `${reh.rehearsalSongs?.length || 0} candidates · ${reh.voteCount ?? 0} votes`
                            : `${reh.rehearsalSongs?.length || 0} songs`}
                        </Eyebrow>
                        <RehearsalTypeBadge rehearsalType={displayType} />
                      </div>
                      <CardTitle className="text-base font-bold text-foreground/90 mt-1 truncate group-hover:text-foreground">
                        {reh.title}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground truncate font-medium mt-1 line-clamp-2">
                        {reh.notes ?? <ClientDate ms={reh.date} variant="datetime" />}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <div className="border-t border-border/60 px-5 py-3.5 bg-transparent flex items-center justify-between gap-2 mt-auto">
                    <span className="text-[10px] text-muted-foreground font-mono tracking-wider">
                      <ClientDate ms={reh.date} variant="datetime" />
                    </span>
                    {voteOpen ? (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-violet-600 dark:text-violet-400">
                        <Clock className="w-3.5 h-3.5" />
                        {timeLeft ? `${timeLeft} left` : "Ending…"}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono tracking-wider">
                        <Clock className="w-3.5 h-3.5" />
                        <ClientDate ms={reh.date} variant="time" />
                      </span>
                    )}
                  </div>
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
          // No refreshData() here — we navigate away immediately, so the
          // refetch's result could never render.
          router.push(`/rehearsals/${id}`);
        }}
      />
    </div>
  );
}
