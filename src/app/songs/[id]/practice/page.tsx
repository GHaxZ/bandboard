import { getSongDetails } from "@/app/actions/songs";
import { getUserSettings, getAllSongProgress } from "@/app/actions/user";
import { redirect } from "next/navigation";
import { PracticeModeClient } from "./PracticeModeClient";
import { ProgressMap } from "@/types/models";

interface PracticeModePageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function PracticeModePage({ params }: PracticeModePageProps) {
  const resolvedParams = await params;
  const song = await getSongDetails(resolvedParams.id);
  const dbSettings = await getUserSettings();
  const preferredInstrument = dbSettings?.preferredInstrument || "Guitar";

  const progressList = await getAllSongProgress();
  const initialProgressMap: ProgressMap = {};
  progressList.forEach((p) => {
    initialProgressMap[p.songId] = {
      status: p.status,
      speed: p.speed,
      notes: p.notes,
      practiceMarkers: p.practiceMarkers,
      backingStartOffset: p.backingStartOffset,
      tabStartOffset: p.tabStartOffset,
    };
  });

  if (!song) {
    redirect("/library");
  }

  return (
    <PracticeModeClient
      songId={resolvedParams.id}
      initialSong={song}
      preferredInstrument={preferredInstrument}
      initialProgressMap={initialProgressMap}
    />
  );
}
