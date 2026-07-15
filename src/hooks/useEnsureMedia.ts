"use client";

import { useEffect } from "react";
import { lazyLoadTrackMedia } from "@/app/actions/songs";
import { NO_VIDEO_SENTINEL } from "@/lib/constants";

// Module-scoped attempt log: lazy-load at most once per roleGroup per session.
const attempted = new Set<string>();

/** Clear the attempt log (call on route change). */
export function clearAttemptedMedia() {
  attempted.clear();
}

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
 * make it idempotent.
 */
export function useEnsureMedia({
  roleGroupId,
  role,
  backingTrackLink,
  tabVideoLink,
  onLoaded,
}: UseEnsureMediaOpts) {
  useEffect(() => {
    if (!roleGroupId || role === "Other") return;
    // If either link is still genuinely null (not the 'none' sentinel), and we
    // haven't already attempted this group, kick off the lookup.
    const needsBacking = backingTrackLink === null;
    const needsTab = tabVideoLink === null;
    if ((!needsBacking && !needsTab) || attempted.has(roleGroupId)) return;

    let mounted = true;
    lazyLoadTrackMedia(roleGroupId)
      .then((res) => {
        if (!mounted) return;
        attempted.add(roleGroupId);
        if (res.success) onLoaded();
      })
      .catch((err) => {
        console.error("useEnsureMedia failed:", err);
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleGroupId, role, backingTrackLink, tabVideoLink]);
}


