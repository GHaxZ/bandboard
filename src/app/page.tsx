import { getSongs } from "@/app/actions/songs";
import { getRehearsals } from "@/app/actions/rehearsals";
import { ClientDashboard } from "@/components/ClientDashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const songs = await getSongs();
  const rehearsals = await getRehearsals();

  return (
    <ClientDashboard
      initialSongs={songs}
      initialRehearsals={rehearsals}
    />
  );
}
