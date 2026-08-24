"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveSongProgress } from "@/app/actions/user";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrivateIndicator } from "./PrivateIndicator";
import { PROGRESS_STATUSES } from "@/lib/constants";
import { toast } from "sonner";
import { useSaveBar } from "@/hooks/use-save-bar";

interface PracticeLogCardProps {
  songId: string;
  initialStatus?: string;
  initialNotes?: string;
  initialSpeed?: number;
  onSaveSuccess?: () => void;
  className?: string;
  showPrivateIndicator?: boolean;
}

export function PracticeLogCard({
  songId,
  initialStatus = "not_started",
  initialNotes = "",
  initialSpeed = 100,
  onSaveSuccess,
  className,
  showPrivateIndicator = false,
}: PracticeLogCardProps) {
  const [progressStatus, setProgressStatus] = useState<string>(initialStatus);
  const [progressNotes, setProgressNotes] = useState<string>(initialNotes);
  const [isSavingProgress, setIsSavingProgress] = useState<boolean>(false);
  // Once the user starts editing, stop syncing from props — both parents fetch
  // progress AFTER mount, and that async load would otherwise silently discard
  // notes typed in the first ~100ms.
  const [hasLocalEdits, setHasLocalEdits] = useState(false);

  useEffect(() => {
    if (hasLocalEdits) return;
    setProgressStatus(initialStatus || "not_started");
    setProgressNotes(initialNotes || "");
  }, [initialStatus, initialNotes, songId, hasLocalEdits]);

  // Switching songs resets the edit guard.
  useEffect(() => {
    setHasLocalEdits(false);
  }, [songId]);

  const hasUnsavedProgress =
    progressStatus !== (initialStatus || "not_started") ||
    progressNotes !== (initialNotes || "");

  async function handleSaveProgress() {
    setIsSavingProgress(true);
    try {
      const res = await saveSongProgress(songId, {
        status: progressStatus as never,
        speed: initialSpeed,
        notes: progressNotes || null,
      });
      if (res.success) {
        toast.success("Progress saved successfully!");
        setHasLocalEdits(false); // re-arm prop syncing with the saved values
        onSaveSuccess?.();
      } else {
        toast.error("Failed to save progress: " + res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingProgress(false);
    }
  }

  function handleRevert() {
    setProgressStatus(initialStatus || "not_started");
    setProgressNotes(initialNotes || "");
    setHasLocalEdits(false);
  }

  useSaveBar(`practice-log-${songId}`, {
    label: "Practice log",
    isDirty: hasUnsavedProgress,
    isSaving: isSavingProgress,
    onSave: handleSaveProgress,
    onRevert: handleRevert,
  });

  return (
    <Card className={cn("border-border bg-card/40 rounded-2xl shadow-lg", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2 flex-wrap">
          <FileText className="w-4 h-4 text-muted-foreground" />
          Practice Log
          {showPrivateIndicator && (
            <PrivateIndicator
              text="Only synced for you"
              tooltip="Your learning status and notes are private to your account."
            />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
            Learning Status
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {PROGRESS_STATUSES.map((status) => {
              const isSelected = progressStatus === status.id;
              return (
                <Button
                  key={status.id}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => {
                    setProgressStatus(status.id);
                    setHasLocalEdits(true);
                  }}
                  className={cn(
                    "rounded-lg text-[9px] font-bold h-8 px-1 transition-all truncate",
                    isSelected
                      ? cn(status.soft, status.border, status.text, "hover:opacity-90 border")
                      : "border-border bg-background/20 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                  title={status.label}
                >
                  {status.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
            Notes
          </label>
          <Textarea
            placeholder="Record highlights, difficult parts, or speed settings..."
            value={progressNotes}
            onChange={(e) => {
              setProgressNotes(e.target.value);
              setHasLocalEdits(true);
            }}
            className="h-24 resize-none text-xs"
          />
        </div>
      </CardContent>
    </Card>
  );
}
