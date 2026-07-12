import { getRehearsalDetails } from "@/app/actions/rehearsals";
import { getUserSettings, getProgressMap } from "@/app/actions/user";
import { redirect } from "next/navigation";
import { RehearsalAutoplayClient } from "./RehearsalAutoplayClient";

interface RehearsalPracticePageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function RehearsalPracticePage({ params }: RehearsalPracticePageProps) {
  const resolvedParams = await params;
  const [rehearsalDetails, settings, initialProgressMap] = await Promise.all([
    getRehearsalDetails(resolvedParams.id),
    getUserSettings(),
    getProgressMap(),
  ]);

  if (!rehearsalDetails) redirect("/rehearsals");

  return (
    <RehearsalAutoplayClient
      initialDetails={rehearsalDetails}
      preferredInstrument={settings.preferredInstrument}
      initialProgressMap={initialProgressMap}
    />
  );
}
