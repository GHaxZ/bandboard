"use client";

import { useEffect, useState } from "react";
import { lazyLoadTrackMedia } from "@/app/actions/songs";

// Module-scoped attempt log: lazy-load at most once per roleGroup per session.
const attempted = new Set<string>();

interface UseEnsureMediaOpts {
  roleGroupId: string | null;
  role: string;
  backingTrackLink: string | null;
  tabVideoLink: string | null;
  onLoaded: () => void;
}

/**
 * Trigger a one-shot lazy YouTube lookup for a role group missing its media
 * links (PLAN §9.8). Safe to call on every render; the module set + guards
 * make it idempotent. Returns true while the lookup is in flight.
 */
export function useEnsureMedia({
  roleGroupId,
  role,
  backingTrackLink,
  tabVideoLink,
  onLoaded,
}: UseEnsureMediaOpts): boolean {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!roleGroupId || role === "Other") return;
    // If either link is still genuinely null (not the 'none' sentinel), and we
    // haven't already attempted this group, kick off the lookup.
    const needsBacking = backingTrackLink === null;
    const needsTab = tabVideoLink === null;
    if ((!needsBacking && !needsTab) || attempted.has(roleGroupId)) return;

    setIsLoading(true);
    lazyLoadTrackMedia(roleGroupId)
      .then((res) => {
        // Only record a completed attempt on success — a transient failure
        // (network hiccup) should not permanently disable lazy-loading for
        // this role group for the whole session.
        if (res.success) {
          attempted.add(roleGroupId);
          onLoaded();
        }
      })
      .catch((err) => {
        console.error("useEnsureMedia failed:", err);
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleGroupId, role, backingTrackLink, tabVideoLink]);

  return isLoading;
}
