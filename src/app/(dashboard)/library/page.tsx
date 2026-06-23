import { getSongs } from "@/app/actions/songs";
import { getUserSettings, getAllSongProgress } from "@/app/actions/user";
import { LibraryDashboard } from "./LibraryDashboard";
import { ProgressMap } from "@/types/models";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const initialSongs = await getSongs();
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

  return (
    <LibraryDashboard
      initialSongs={initialSongs}
      preferredInstrument={preferredInstrument}
      initialProgressMap={initialProgressMap}
    />
  );
}
