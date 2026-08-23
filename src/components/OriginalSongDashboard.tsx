"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PracticeLogCard } from "./PracticeLogCard";
import { PracticeButton } from "./PracticeButton";
import { EmptyState } from "./EmptyState";
import { getCoverArtUrl } from "./CoverArt";
import { useSongProgress } from "@/hooks/useSongProgress";
import { Music, Pencil, Trash2 } from "lucide-react";
import { INSTRUMENT_ROLES, ROLE_LABEL } from "@/lib/constants";
import type { Role } from "@/lib/constants";
import type { Song, CustomTrack } from "@/types/models";

interface OriginalSongDashboardProps {
  song: Song;
  onRefresh: () => void;
  onDelete?: () => void;
  onPractice?: () => void;
  onEdit?: () => void;
  preferredInstrument?: string;
}

export function OriginalSongDashboard({
  song,
  onRefresh,
  onDelete,
  onPractice,
  onEdit,
  preferredInstrument,
}: OriginalSongDashboardProps) {
  const { progress: initialProgress, reload: reloadProgress } = useSongProgress(song.id);

  const tracks = song.customTracks ?? [];

  const stemsByRole: Record<string, CustomTrack[]> = {};
  for (const stem of tracks) {
    (stemsByRole[stem.role] ??= []).push(stem);
  }
  const rolesWithStems = INSTRUMENT_ROLES.filter(
    (r) => (stemsByRole[r] ?? []).length > 0
  );

  const [activeRole, setActiveRole] = useState<string>("");

  useEffect(() => {
    if (rolesWithStems.length > 0 && !activeRole) {
      if (preferredInstrument && rolesWithStems.includes(preferredInstrument as Role)) {
        setActiveRole(preferredInstrument);
      } else {
        setActiveRole(rolesWithStems[0]);
      }
    }
  }, [rolesWithStems, preferredInstrument, activeRole]);

  const coverArtSrc = getCoverArtUrl(song);

  return (
    <Card className="border-border bg-card overflow-hidden rounded-2xl shadow-xl">
      <CardHeader className="border-b border-border pb-5 pt-6 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {coverArtSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverArtSrc}
              alt=""
              className="w-14 h-14 rounded-xl object-cover border border-border flex-shrink-0"
            />
          )}
          <div>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/60 border border-dialog-border/50 px-2.5 py-1 rounded-full">
              Song Details
            </span>
            <CardTitle className="text-2xl font-heading font-bold text-foreground mt-2 flex items-center gap-2">
              {song.title}
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs mt-0.5 font-medium">
              by {song.artist}
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-center">
          {onPractice && <PracticeButton onClick={onPractice} />}

          {onEdit && (
            <Button
              variant="secondary"
              onClick={onEdit}
              className="rounded-xl h-9 px-4 text-xs font-bold"
              title="Edit Original"
            >
              <Pencil className="w-4 h-4" /> Edit
            </Button>
          )}

          {onDelete && (
            <Button
              variant="danger-subtle"
              size="icon"
              onClick={onDelete}
              className="rounded-xl h-9 w-9"
              title="Delete Song"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {tracks.length === 0 ? (
          <EmptyState
            icon={Music}
            title="No Stems Yet"
            description="This original has no stems. Click Edit to add some."
            action={
              onEdit && (
                <Button
                  onClick={onEdit}
                  className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl font-bold flex items-center gap-1.5 mx-auto"
                >
                  <Pencil className="w-4 h-4" /> Edit Song
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Instrument selector — matching cover style */}
            {rolesWithStems.length > 0 && (
              <Tabs value={activeRole} onValueChange={setActiveRole} className="w-full">
                <div className="overflow-x-auto pb-2 -mx-2 px-2 scrollbar-none">
                  <TabsList className="bg-background border border-border p-1 rounded-xl h-auto flex w-max min-w-full">
                    {rolesWithStems.map((role) => (
                      <TabsTrigger
                        key={role}
                        value={role}
                        className="px-4 py-2 text-xs font-bold rounded-xl data-[state=active]:bg-muted data-[state=active]:text-foreground text-muted-foreground border border-transparent data-[state=active]:border-dialog-border hover:text-foreground transition-all cursor-pointer"
                      >
                        {ROLE_LABEL[role]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {rolesWithStems.map((role) => (
                  <TabsContent
                    key={role}
                    value={role}
                    className="mt-6 focus-visible:ring-0 focus-visible:outline-none"
                  >
                    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Music className="w-4 h-4 text-muted-foreground" />
                          <span className="font-heading font-bold text-sm text-muted-foreground">
                            {ROLE_LABEL[role as Role]}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {(stemsByRole[role] ?? []).length} stem{stemsByRole[role].length === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {(stemsByRole[role] ?? []).map((track) => (
                          <div
                            key={track.id}
                            className="p-4 bg-background/60 border border-border rounded-2xl flex items-center justify-between gap-3"
                          >
                            <div className="text-xs font-heading font-bold text-foreground truncate">
                              {track.label}
                            </div>
                            {(role === "Guitar" || role === "Bass") && song.tunings?.[role] && (
                              <div className="flex items-center gap-1.5 bg-card border border-border px-2.5 py-1 rounded-lg flex-shrink-0">
                                <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">
                                  Tuning:
                                </span>
                                <span className="text-xs font-mono font-bold text-muted-foreground tracking-wide">
                                  {song.tunings[role]}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </>
        )}

        <PracticeLogCard
          songId={song.id}
          initialStatus={initialProgress?.status}
          initialNotes={initialProgress?.notes ?? ""}
          initialSpeed={initialProgress?.speed}
          onSaveSuccess={async () => {
            await reloadProgress();
            onRefresh();
          }}
          className="border-border/60 bg-background/60"
          showPrivateIndicator
        />
      </CardContent>
    </Card>
  );
}
