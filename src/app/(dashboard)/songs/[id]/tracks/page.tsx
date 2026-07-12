import { getSongDetails } from "@/app/actions/songs";
import { getCustomTracks } from "@/app/actions/customTracks";
import { getUserSettings } from "@/app/actions/user";
import { redirect } from "next/navigation";
import { TrackStudioClient } from "./TrackStudioClient";

interface TrackStudioPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function TrackStudioPage({ params }: TrackStudioPageProps) {
  const resolvedParams = await params;
  const [song, tracks, settings] = await Promise.all([
    getSongDetails(resolvedParams.id),
    getCustomTracks(resolvedParams.id),
    getUserSettings(),
  ]);

  if (!song) redirect("/library");

  return (
    <TrackStudioClient
      songId={resolvedParams.id}
      initialSong={song}
      initialTracks={tracks}
      preferredInstrument={settings.preferredInstrument}
    />
  );
}
