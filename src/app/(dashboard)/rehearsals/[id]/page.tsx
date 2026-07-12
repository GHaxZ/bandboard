import { getRehearsalDetails } from "@/app/actions/rehearsals";
import { getSongs } from "@/app/actions/songs";
import { getUserSettings, getProgressMap } from "@/app/actions/user";
import { redirect } from "next/navigation";
import { RehearsalDetailClient } from "./RehearsalDetailClient";

interface RehearsalPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function RehearsalDetailPage({ params }: RehearsalPageProps) {
  const resolvedParams = await params;
  const [rehearsalDetails, songsList, settings, initialProgressMap] = await Promise.all([
    getRehearsalDetails(resolvedParams.id),
    getSongs(),
    getUserSettings(),
    getProgressMap(),
  ]);

  if (!rehearsalDetails) redirect("/rehearsals");

  return (
    <RehearsalDetailClient
      rehearsalId={resolvedParams.id}
      initialDetails={rehearsalDetails}
      songsList={songsList}
      preferredInstrument={settings.preferredInstrument}
      initialProgressMap={initialProgressMap}
    />
  );
}
