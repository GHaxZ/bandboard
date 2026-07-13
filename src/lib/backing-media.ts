import type { Song, BackingMedia, UserProgress } from '@/types/models';
import { resolveOffsets } from '@/types/models';
import { getYouTubeId } from '@/lib/youtube';
import type { Role } from '@/lib/constants';

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

  // cover — mirror the priority ladder of getBackingVideoId
  const standardRoleGroups = song.roleGroups.filter((rg) => rg.role !== 'Other');

  const resolveSlot = (
    rg: typeof standardRoleGroups[number] | undefined,
    type: 'backing' | 'tab'
  ): BackingMedia | null => {
    if (!rg) return null;
    const customId = type === 'backing' ? rg.backingCustomTrackId : rg.tabCustomTrackId;
    if (customId && song.customTracks?.some((t) => t.id === customId)) {
      return {
        kind: 'custom-file',
        customTrackId: customId,
        offset: resolveOffsets(progress, rg.id).backing,
      };
    }
    const link = type === 'backing' ? rg.backingTrackLink : rg.tabVideoLink;
    const ytId = link ? getYouTubeId(link) : null;
    if (ytId) {
      return {
        kind: 'youtube',
        videoId: ytId,
        offset:
          type === 'backing'
            ? resolveOffsets(progress, rg.id).backing
            : resolveOffsets(progress, rg.id).tab,
      };
    }
    return null;
  };

  // 1. preferred role's backing slot
  if (preferredRole) {
    const matching = standardRoleGroups.find(
      (rg) => rg.role.toLowerCase() === preferredRole.toLowerCase()
    );
    const result = resolveSlot(matching, 'backing');
    if (result) return result;
  }

  // 2. any role's backing slot
  for (const rg of standardRoleGroups) {
    const result = resolveSlot(rg, 'backing');
    if (result) return result;
  }

  // 3. preferred role's tab slot
  if (preferredRole) {
    const matching = standardRoleGroups.find(
      (rg) => rg.role.toLowerCase() === preferredRole.toLowerCase()
    );
    const result = resolveSlot(matching, 'tab');
    if (result) return result;
  }

  // 4. any role's tab slot
  for (const rg of standardRoleGroups) {
    const result = resolveSlot(rg, 'tab');
    if (result) return result;
  }

  return { kind: 'none' };
}
