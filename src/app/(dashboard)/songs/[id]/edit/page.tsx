import { getSongDetails } from "@/app/actions/songs";
import { getCustomTracks } from "@/app/actions/customTracks";
import { getUserSettings, getSongProgress } from "@/app/actions/user";
import { redirect } from "next/navigation";
import { OriginalEditorClient } from "./OriginalEditorClient";

export const dynamic = "force-dynamic";

interface EditOriginalPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditOriginalPage({ params }: EditOriginalPageProps) {
  const resolvedParams = await params;
  const [song, tracks, settings, progress] = await Promise.all([
    getSongDetails(resolvedParams.id),
    getCustomTracks(resolvedParams.id),
    getUserSettings(),
    getSongProgress(resolvedParams.id),
  ]);

  if (!song) redirect("/library");
  if (song.songType !== "original") redirect(`/songs/${resolvedParams.id}`);

  return (
    <OriginalEditorClient
      songId={resolvedParams.id}
      initialSong={song}
      initialTracks={tracks}
      preferredInstrument={settings.preferredInstrument}
      initialScratchpadNotes={progress?.scratchpadNotes ?? ""}
    />
  );
}