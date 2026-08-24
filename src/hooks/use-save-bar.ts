"use client";

import { useEffect, useRef } from "react";
import { useSaveBarStore, type SaveBarSlot } from "@/stores/save-bar-store";

/**
 * Registers a save-bar slot for this component's lifetime.
 * Pass `null` as the slot to unregister (e.g. closed dialogs, absent engine data).
 * Callbacks are read through a ref, so inline closures stay fresh without re-registering;
 * only the primitives (label/isDirty/isSaving) trigger store updates.
 */
export function useSaveBar(id: string | null, slot: SaveBarSlot | null): void {
  const register = useSaveBarStore((s) => s.register);
  const unregister = useSaveBarStore((s) => s.unregister);
  const slotRef = useRef<SaveBarSlot | null>(slot);
  useEffect(() => {
    slotRef.current = slot;
  });

  const label = slot?.label ?? "";
  const isDirty = slot?.isDirty ?? false;
  const isSaving = slot?.isSaving ?? false;

  useEffect(() => {
    if (!id || !slotRef.current) return;
    const stable: SaveBarSlot = {
      label,
      isDirty,
      isSaving,
      onSave: () => slotRef.current!.onSave(),
      onRevert: () => slotRef.current!.onRevert(),
    };
    register(id, stable);
    return () => unregister(id);
  }, [id, label, isDirty, isSaving, register, unregister]);
}
