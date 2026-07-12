import { getSongDetails } from "@/app/actions/songs";
import { getUserSettings, getProgressMap } from "@/app/actions/user";
import { redirect } from "next/navigation";
import { PracticeModeClient } from "./PracticeModeClient";

interface PracticeModePageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function PracticeModePage({ params }: PracticeModePageProps) {
  const resolvedParams = await params;
  const [song, settings, initialProgressMap] = await Promise.all([
    getSongDetails(resolvedParams.id),
    getUserSettings(),
    getProgressMap(),
  ]);

  if (!song) redirect("/library");

  return (
    <PracticeModeClient
      songId={resolvedParams.id}
      initialSong={song}
      preferredInstrument={settings.preferredInstrument}
      initialProgressMap={initialProgressMap}
      initialVolume={settings.volume}
      initialSpeed={settings.playbackSpeed}
    />
  );
}
