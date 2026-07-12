"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveSongProgress } from "@/app/actions/user";
import { Loader2, FileText, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrivateIndicator } from "./PrivateIndicator";
import { PROGRESS_STATUSES } from "@/lib/constants";
import { toast } from "sonner";

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
  const [progressSpeed, setProgressSpeed] = useState<number>(initialSpeed);
  const [isSavingProgress, setIsSavingProgress] = useState<boolean>(false);

  useEffect(() => {
    setProgressStatus(initialStatus || "not_started");
    setProgressNotes(initialNotes || "");
    setProgressSpeed(initialSpeed || 100);
  }, [initialStatus, initialNotes, initialSpeed, songId]);

  const hasUnsavedProgress =
    progressStatus !== (initialStatus || "not_started") ||
    progressNotes !== (initialNotes || "");

  async function handleSaveProgress() {
    setIsSavingProgress(true);
    try {
      const res = await saveSongProgress(songId, {
        status: progressStatus as never,
        speed: progressSpeed,
        notes: progressNotes || null,
      });
      if (res.success) {
        toast.success("Progress saved successfully!");
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

  return (
    <Card className={cn("border-border bg-card/40 rounded-2xl shadow-lg", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2 flex-wrap">
          <FileText className="w-4 h-4 text-muted-foreground" />
          Practice Log
          {showPrivateIndicator && (
            <PrivateIndicator
              text="Only synced for you"
              tooltip="Your learning status and notes are private to your device."
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
                  onClick={() => setProgressStatus(status.id)}
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
          <textarea
            placeholder="Record highlights, difficult parts, or speed settings..."
            value={progressNotes}
            onChange={(e) => setProgressNotes(e.target.value)}
            className="w-full bg-background border border-border rounded-xl text-xs text-foreground p-3 focus:outline-none focus:border-[#5b80a5] focus:ring-1 focus:ring-ring resize-none h-24 placeholder:text-[#4e525a]"
          />
        </div>

        <Button
          onClick={handleSaveProgress}
          disabled={isSavingProgress}
          className={cn(
            "w-full text-xs font-bold py-2 h-10 flex items-center justify-center gap-1.5 transition-all duration-300 rounded-xl",
            hasUnsavedProgress && !isSavingProgress
              ? "bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse"
              : "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground"
          )}
        >
          {isSavingProgress ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              Save Practice Log
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
