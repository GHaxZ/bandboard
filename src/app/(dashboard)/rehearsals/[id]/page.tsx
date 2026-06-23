import { getRehearsalDetails } from "@/app/actions/rehearsals";
import { getSongs } from "@/app/actions/songs";
import { getUserSettings, getAllSongProgress } from "@/app/actions/user";
import { redirect } from "next/navigation";
import { RehearsalDetailClient } from "./RehearsalDetailClient";
import { ProgressMap } from "@/types/models";

interface RehearsalPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function RehearsalDetailPage({ params }: RehearsalPageProps) {
  const resolvedParams = await params;
  const rehearsalDetails = await getRehearsalDetails(resolvedParams.id);
  const songsList = await getSongs();
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

  if (!rehearsalDetails) {
    redirect("/rehearsals");
  }

  return (
    <RehearsalDetailClient
      rehearsalId={resolvedParams.id}
      initialDetails={rehearsalDetails}
      songsList={songsList}
      preferredInstrument={preferredInstrument}
      initialProgressMap={initialProgressMap}
    />
  );
}
