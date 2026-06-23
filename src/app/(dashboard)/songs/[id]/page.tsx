import { getSongDetails } from "@/app/actions/songs";
import { getUserSettings } from "@/app/actions/user";
import { redirect } from "next/navigation";
import { SongDetailClient } from "./SongDetailClient";

interface SongPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function SongDetailPage({ params }: SongPageProps) {
  const resolvedParams = await params;
  const song = await getSongDetails(resolvedParams.id);
  const dbSettings = await getUserSettings();
  const preferredInstrument = dbSettings?.preferredInstrument || "Guitar";

  if (!song) {
    redirect("/library");
  }

  return (
    <SongDetailClient
      songId={resolvedParams.id}
      initialSong={song}
      preferredInstrument={preferredInstrument}
    />
  );
}
