import type { Song, BackingMedia, UserProgress } from '@/types/models';
import { resolveOffsets } from '@/types/models';
import { getYouTubeId } from '@/lib/youtube';
import type { Role } from '@/lib/constants';

/** Minimal shape of a role group needed for slot resolution (both the cover
 *  media resolver and the autoplay video resolver use this ladder). */
export interface SlotRoleGroup {
  id: string;
  role: string;
  backingTrackLink: string | null;
  tabVideoLink: string | null;
  backingCustomTrackId: string | null;
  tabCustomTrackId: string | null;
}

/**
 * Walk the shared backing/tab priority ladder:
 *   1. preferred role's backing slot → 2. any role's backing slot
 *   3. preferred role's tab slot → 4. any role's tab slot
 * `resolve` returns the media for a (roleGroup, slot-type) pair, or null to
 * continue down the ladder. Previously hand-mirrored in `resolveBackingMedia`
 * and `getBackingVideoId` (youtube.ts), which had drifted apart.
 */
function resolveSlotLadder<T>(
  roleGroups: SlotRoleGroup[],
  preferredRole: string | undefined,
  resolve: (rg: SlotRoleGroup, type: 'backing' | 'tab') => T | null
): T | null {
  const standard = roleGroups.filter((rg) => rg.role !== 'Other');
  const preferred = preferredRole
    ? standard.find((rg) => rg.role.toLowerCase() === preferredRole.toLowerCase())
    : undefined;

  const candidates: Array<[SlotRoleGroup | undefined, 'backing' | 'tab']> = [
    [preferred, 'backing'],
  ];
  for (const rg of standard) candidates.push([rg, 'backing']);
  if (preferred) candidates.push([preferred, 'tab']);
  for (const rg of standard) candidates.push([rg, 'tab']);

  for (const [rg, type] of candidates) {
    if (!rg) continue;
    const result = resolve(rg, type);
    if (result) return result;
  }
  return null;
}

export function resolveBackingMedia(
  song: Song,
  preferredRole: Role,
  progress?: UserProgress | null
): BackingMedia {
  if (song.songType === 'original') {
    const tracks = song.customTracks ?? [];
    if (tracks.length === 0) return { kind: 'none' };
    return { kind: 'multistem', tracks, mutedRole: preferredRole };
  }

  // cover — the priority ladder is shared with getBackingVideoId
  const result = resolveSlotLadder<BackingMedia>(song.roleGroups, preferredRole, (rg, type) => {
    const customId = type === 'backing' ? rg.backingCustomTrackId : rg.tabCustomTrackId;
    if (customId && song.customTracks?.some((t) => t.id === customId)) {
      return {
        kind: 'custom-file' as const,
        customTrackId: customId,
        // A tab-slot custom file must use the tab offset, not always the
        // backing one (which caused sync drift).
        offset:
          type === 'backing'
            ? resolveOffsets(progress, rg.id).backing
            : resolveOffsets(progress, rg.id).tab,
      };
    }
    const link = type === 'backing' ? rg.backingTrackLink : rg.tabVideoLink;
    const ytId = link ? getYouTubeId(link) : null;
    if (ytId) {
      return {
        kind: 'youtube' as const,
        videoId: ytId,
        offset:
          type === 'backing'
            ? resolveOffsets(progress, rg.id).backing
            : resolveOffsets(progress, rg.id).tab,
      };
    }
    return null;
  });

  return result ?? { kind: 'none' };
}
