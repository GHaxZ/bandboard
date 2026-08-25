import { getRehearsalWithVoteView } from "@/app/actions/rehearsals";
import { getSongs } from "@/app/actions/songs";
import { getUserSettings, getProgressMap } from "@/app/actions/user";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RehearsalDetailClient } from "./RehearsalDetailClient";
import { VotingClient } from "./VotingClient";

interface RehearsalPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function RehearsalDetailPage({ params }: RehearsalPageProps) {
  const resolvedParams = await params;
  // Resolves the view mode server-side: open vote → voting UI; everything
  // else (manual sessions AND finalized votes) → standard rehearsal view.
  const { details, votingState } = await getRehearsalWithVoteView(resolvedParams.id);

  if (votingState) {
    const [songsList, settings, initialProgressMap, currentUser] = await Promise.all([
      getSongs(),
      getUserSettings(),
      getProgressMap(),
      getSessionUser(),
    ]);
    return (
      <VotingClient
        rehearsalId={resolvedParams.id}
        initialState={votingState}
        songsList={songsList}
        preferredInstrument={settings.preferredInstrument}
        initialProgressMap={initialProgressMap}
        currentUserId={currentUser?.id ?? ""}
        currentUsername={currentUser?.username ?? "You"}
      />
    );
  }

  if (!details) redirect("/rehearsals");

  const [songsList, settings, initialProgressMap] = await Promise.all([
    getSongs(),
    getUserSettings(),
    getProgressMap(),
  ]);

  return (
    <RehearsalDetailClient
      rehearsalId={resolvedParams.id}
      initialDetails={details}
      songsList={songsList}
      preferredInstrument={settings.preferredInstrument}
      initialProgressMap={initialProgressMap}
    />
  );
}
