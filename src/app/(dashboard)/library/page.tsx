import { getSongs } from "@/app/actions/songs";
import { getUserSettings, getProgressMap } from "@/app/actions/user";
import { LibraryDashboard } from "./LibraryDashboard";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const [initialSongs, settings, initialProgressMap] = await Promise.all([
    getSongs(),
    getUserSettings(),
    getProgressMap(),
  ]);

  return (
    <LibraryDashboard
      initialSongs={initialSongs}
      preferredInstrument={settings.preferredInstrument}
      initialProgressMap={initialProgressMap}
    />
  );
}
