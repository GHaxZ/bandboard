import { create } from "zustand";

export interface SaveBarSlot {
  label: string;
  isDirty: boolean;
  isSaving: boolean;
  // ponytail: `unknown` return — savers may or may not report success booleans
  onSave: () => unknown;
  onRevert: () => void;
}

interface SaveBarState {
  slots: Record<string, SaveBarSlot>;
  register: (id: string, slot: SaveBarSlot) => void;
  unregister: (id: string) => void;
  guardOpen: boolean;
  pendingNav: (() => void) | null;
  /** True when the guarded navigation is a history "back" — needs sentinel skipping. */
  isBackNav: boolean;
  openGuard: (pendingNav: (() => void) | null, isBackNav?: boolean) => void;
  closeGuard: () => void;
}

export const useSaveBarStore = create<SaveBarState>((set) => ({
  slots: {},
  register: (id, slot) =>
    set((state) => ({ slots: { ...state.slots, [id]: slot } })),
  unregister: (id) =>
    set((state) => {
      if (!(id in state.slots)) return state;
      const slots = { ...state.slots };
      delete slots[id];
      return { slots };
    }),
  guardOpen: false,
  pendingNav: null,
  isBackNav: false,
  openGuard: (pendingNav, isBackNav = false) =>
    set({ guardOpen: true, pendingNav, isBackNav }),
  closeGuard: () => set({ guardOpen: false, pendingNav: null, isBackNav: false }),
}));

/** Imperative dirty check for non-React guards (beforeunload, click interceptor, popstate). */
export function hasDirtySlots(): boolean {
  return Object.values(useSaveBarStore.getState().slots).some((s) => s.isDirty);
}

/** Restore every dirty surface to its last saved state. */
export function revertAllDirty(): void {
  for (const s of Object.values(useSaveBarStore.getState().slots)) {
    if (s.isDirty) s.onRevert();
  }
}

/** Run nav immediately when clean; otherwise open the guard dialog with the intended nav as continuation. */
export function navigateWithGuard(nav: () => void): void {
  if (hasDirtySlots()) useSaveBarStore.getState().openGuard(nav);
  else nav();
}

/**
 * History "back" with dirty guard. While dirty, our history-sentinel entry sits
 * on top of the real current entry, so the guard's leave action must skip it
 * (history.go(-2)) — a plain back() would just pop the sentinel and land on the
 * same page.
 */
export function navigateBackWithGuard(): void {
  if (hasDirtySlots()) useSaveBarStore.getState().openGuard(null, true);
  else window.history.back();
}
