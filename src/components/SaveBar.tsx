"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useSaveBarStore,
  hasDirtySlots,
  revertAllDirty,
} from "@/stores/save-bar-store";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Global unsaved-changes bar. Fixed to the bottom, z-[60] so it floats above
 * dialogs and fullscreen practice overlays (z-50) and the mobile tab bar (z-40).
 * Also owns the navigation guard: in-app link clicks, programmatic exits,
 * browser back (history sentinel), and refresh/close (beforeunload).
 */
export function SaveBar() {
  const router = useRouter();
  const slots = useSaveBarStore((s) => s.slots);
  const guardOpen = useSaveBarStore((s) => s.guardOpen);
  const pendingNav = useSaveBarStore((s) => s.pendingNav);
  const isBackNav = useSaveBarStore((s) => s.isBackNav);
  const openGuard = useSaveBarStore((s) => s.openGuard);
  const closeGuard = useSaveBarStore((s) => s.closeGuard);

  const entries = useMemo(() => Object.entries(slots), [slots]);
  const dirtySlots = entries.filter(([, s]) => s.isDirty);
  const isDirty = dirtySlots.length > 0;
  const isSaving = entries.some(([, s]) => s.isSaving);
  const visible = entries.length > 0 && (isDirty || isSaving);

  const leavingRef = useRef(false);

  // Guard: refresh / close / external navigation (native browser prompt).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Guard: in-app <Link> clicks (capture phase, before Next.js router).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!hasDirtySlots() || e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      if (a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const url = new URL(href, window.location.origin);
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      openGuard(() => router.push(url.pathname + url.search));
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [openGuard, router]);

  // Guard: browser back button via history sentinel.
  useEffect(() => {
    if (!isDirty) return;
    // Preserve whatever state the framework keeps on this entry, add our flag.
    window.history.pushState({ ...(window.history.state ?? {}), bbGuard: true }, "");
    const onPop = () => {
      if (hasDirtySlots()) {
        // Cancel the back navigation by re-arming the sentinel, then ask.
        window.history.pushState({ ...(window.history.state ?? {}), bbGuard: true }, "");
        openGuard(null, true);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Drop our sentinel entry when disarming or leaving intentionally.
      // ponytail: leaves one same-URL history entry behind after a guarded SPA nav; harmless.
      if (window.history.state?.bbGuard && !leavingRef.current) window.history.back();
    };
  }, [isDirty, openGuard, router]);

  function handleLeave() {
    leavingRef.current = true;
    revertAllDirty();
    closeGuard();
    if (isBackNav) {
      // Our sentinel entry sits on top of the real current entry while dirty —
      // a plain back() would only pop the sentinel and land on the same page.
      window.history.go(-2);
    } else {
      pendingNav?.();
    }
    setTimeout(() => {
      leavingRef.current = false;
    }, 0);
  }

  async function handleSaveAll() {
    await Promise.allSettled(dirtySlots.map(([, s]) => s.onSave()));
  }

  return (
    <>
      {visible && (
        <div
          role="region"
          aria-live="polite"
          aria-label="Unsaved changes"
          className={cn(
            "fixed z-[60] inset-x-3 bottom-20 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:bottom-6",
            "flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur-lg shadow-2xl pl-4 pr-3 py-2.5",
            "animate-in slide-in-from-bottom-4 fade-in-0 duration-300"
          )}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground whitespace-nowrap">
              Unsaved changes
              {dirtySlots.length > 1 && (
                <span className="ml-1.5 text-[10px] font-bold text-muted-foreground">
                  ({dirtySlots.length} sections)
                </span>
              )}
            </p>
            {dirtySlots.length === 1 && (
              <p className="text-[10px] text-muted-foreground truncate max-w-[180px] md:max-w-[240px]">
                {dirtySlots[0][1].label}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto pl-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={isSaving}
              onClick={revertAllDirty}
              className="text-muted-foreground hover:text-foreground rounded-xl gap-1.5 text-xs font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Revert
            </Button>
            <Button
              variant="success"
              size="sm"
              disabled={isSaving}
              onClick={handleSaveAll}
              className="rounded-xl gap-1.5 text-xs font-bold min-w-[92px]"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> Save
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={guardOpen}
        onClose={closeGuard}
        onConfirm={handleLeave}
        title="Discard unsaved changes?"
        description="Your changes will be reverted to the last saved state before leaving. This cannot be undone."
        confirmLabel="Discard & Leave"
        cancelLabel="Stay on page"
        destructive
      />
    </>
  );
}
