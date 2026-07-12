import { getRehearsalDetails } from "@/app/actions/rehearsals";
import { getUserSettings, getProgressMap } from "@/app/actions/user";
import { redirect } from "next/navigation";
import { RehearsalKanbanClient } from "./RehearsalKanbanClient";

interface RehearsalKanbanPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function RehearsalKanbanPage({ params }: RehearsalKanbanPageProps) {
  const resolvedParams = await params;
  const [rehearsalDetails, settings, initialProgressMap] = await Promise.all([
    getRehearsalDetails(resolvedParams.id),
    getUserSettings(),
    getProgressMap(),
  ]);

  if (!rehearsalDetails) redirect("/rehearsals");

  return (
    <RehearsalKanbanClient
      rehearsalId={resolvedParams.id}
      initialDetails={rehearsalDetails}
      preferredInstrument={settings.preferredInstrument}
      initialProgressMap={initialProgressMap}
    />
  );
}
