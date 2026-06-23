"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RehearsalAutoplay } from "@/components/RehearsalAutoplay";
import { getUserSettings, getAllSongProgress } from "@/app/actions/user";
import { RehearsalDetails, ProgressMap } from "@/types/models";

interface RehearsalAutoplayClientProps {
  rehearsalId: string;
  initialDetails: RehearsalDetails;
  preferredInstrument: string;
  initialProgressMap: ProgressMap;
}

export function RehearsalAutoplayClient({
  rehearsalId,
  initialDetails,
  preferredInstrument,
  initialProgressMap,
}: RehearsalAutoplayClientProps) {
  const router = useRouter();

  const [rehearsalDetails] = useState<RehearsalDetails>(initialDetails);
  const [instrument, setInstrument] = useState(preferredInstrument);
  const [progressMap, setProgressMap] = useState<ProgressMap>(initialProgressMap);

  useEffect(() => {
    // No longer need client-side data loader on mount as progressMap is loaded server-side!
  }, []);

  return (
    <RehearsalAutoplay
      rehearsal={rehearsalDetails}
      onExit={() => router.push(`/rehearsals/${rehearsalId}`)}
      preferredInstrument={instrument}
      progressMap={progressMap}
    />
  );
}
