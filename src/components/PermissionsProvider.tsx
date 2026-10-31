"use client";
import { createContext, useContext } from 'react';
const OrganizerContext = createContext(false);
export function PermissionsProvider({ organizer, children }: { organizer: boolean; children: React.ReactNode }) {
  return <OrganizerContext.Provider value={organizer}>{children}</OrganizerContext.Provider>;
}
// Presentation only. Every privileged server action independently checks the role.
export function useIsOrganizer(): boolean { return useContext(OrganizerContext); }
