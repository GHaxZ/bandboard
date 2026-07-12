"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RehearsalAutoplay } from "@/components/RehearsalAutoplay";
import type { RehearsalDetails, ProgressMap } from "@/types/models";
import type { Role } from "@/lib/constants";

interface RehearsalAutoplayClientProps {
  initialDetails: RehearsalDetails;
  preferredInstrument: Role;
  initialProgressMap: ProgressMap;
}

export function RehearsalAutoplayClient({
  initialDetails,
  preferredInstrument,
  initialProgressMap,
}: RehearsalAutoplayClientProps) {
  const router = useRouter();
  const [rehearsalId] = useState(initialDetails.id);
  return (
    <RehearsalAutoplay
      rehearsal={initialDetails}
      onExit={() => router.push(`/rehearsals/${rehearsalId}`)}
      preferredInstrument={preferredInstrument}
      progressMap={initialProgressMap}
    />
  );
}
