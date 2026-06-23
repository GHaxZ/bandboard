import { getRehearsalDetails } from "@/app/actions/rehearsals";
import { getUserSettings, getAllSongProgress } from "@/app/actions/user";
import { redirect } from "next/navigation";
import { RehearsalAutoplayClient } from "./RehearsalAutoplayClient";
import { ProgressMap } from "@/types/models";

interface RehearsalPracticePageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function RehearsalPracticePage({ params }: RehearsalPracticePageProps) {
  const resolvedParams = await params;
  const rehearsalDetails = await getRehearsalDetails(resolvedParams.id);
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
    <RehearsalAutoplayClient
      rehearsalId={resolvedParams.id}
      initialDetails={rehearsalDetails}
      preferredInstrument={preferredInstrument}
      initialProgressMap={initialProgressMap}
    />
  );
}
