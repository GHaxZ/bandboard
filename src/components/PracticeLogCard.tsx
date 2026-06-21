"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveSongProgress } from "@/app/actions/user";
import { Loader2, FileText, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface PracticeLogCardProps {
  songId: string;
  initialStatus?: string;
  initialNotes?: string;
  initialSpeed?: number;
  onSaveSuccess?: () => void;
  className?: string;
}

export function PracticeLogCard({
  songId,
  initialStatus = "learning",
  initialNotes = "",
  initialSpeed = 100,
  onSaveSuccess,
  className
}: PracticeLogCardProps) {
  const [progressStatus, setProgressStatus] = useState<string>(initialStatus);
  const [progressNotes, setProgressNotes] = useState<string>(initialNotes);
  const [progressSpeed, setProgressSpeed] = useState<number>(initialSpeed);
  const [isSavingProgress, setIsSavingProgress] = useState<boolean>(false);

  // Sync state with props when they change
  useEffect(() => {
    setProgressStatus(initialStatus || "learning");
    setProgressNotes(initialNotes || "");
    setProgressSpeed(initialSpeed || 100);
  }, [initialStatus, initialNotes, initialSpeed, songId]);

  const hasUnsavedProgress =
    progressStatus !== (initialStatus || "learning") ||
    progressNotes !== (initialNotes || "");

  const handleSaveProgress = async () => {
    setIsSavingProgress(true);
    try {
      const res = await saveSongProgress(songId, progressStatus, progressSpeed, progressNotes);
      if (res.success) {
        if (onSaveSuccess) {
          onSaveSuccess();
        }
      } else {
        alert("Failed to save progress: " + res.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingProgress(false);
    }
  };

  return (
    <Card className={cn("border-[#27282b] bg-[#161719]/40 rounded-2xl shadow-lg", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold text-[#f1f2f4] flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#888d96]" />
          Practice Log
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Learning Status */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-[#888d96] uppercase tracking-wider block">Learning Status</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {["not_started", "learning", "ready_to_play", "mastered"].map((status) => {
              const isSelected = progressStatus === status;
              const label = 
                status === "not_started" 
                  ? "Not Started" 
                  : status === "learning" 
                  ? "Learning" 
                  : status === "ready_to_play"
                  ? "Ready to Play"
                  : "Mastered";
              return (
                <Button
                  key={status}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => setProgressStatus(status)}
                  className={cn(
                    "rounded-lg text-[9px] font-bold h-8 px-1 transition-all truncate",
                    isSelected
                      ? status === "mastered"
                        ? "bg-emerald-950/40 border border-emerald-800 text-emerald-400 hover:bg-emerald-950/50"
                        : status === "ready_to_play"
                        ? "bg-purple-950/40 border border-purple-800 text-purple-400 hover:bg-purple-950/50"
                        : status === "learning"
                        ? "bg-sky-950/40 border border-sky-800 text-sky-400 hover:bg-sky-950/50"
                        : "bg-zinc-800/40 border border-zinc-700 text-zinc-300 hover:bg-zinc-800/50"
                      : "border-[#27282b] bg-[#0c0d0e]/20 text-[#888d96] hover:bg-[#27282b]/50 hover:text-[#f1f2f4]"
                  )}
                  title={label}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <label className="text-[11px] font-bold text-[#888d96] uppercase tracking-wider block">Notes</label>
          <textarea
            placeholder="Record highlights, difficult parts, or speed settings..."
            value={progressNotes}
            onChange={(e) => setProgressNotes(e.target.value)}
            className="w-full bg-[#0c0d0e] border border-[#27282b] rounded-xl text-xs text-[#f1f2f4] p-3 focus:outline-none focus:border-[#5b80a5] focus:ring-1 focus:ring-[#5b80a5] resize-none h-24 placeholder:text-[#4e525a]"
          />
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSaveProgress}
          disabled={isSavingProgress}
          className={cn(
            "w-full text-xs font-bold py-2 h-10 flex items-center justify-center gap-1.5 transition-all duration-300 rounded-xl",
            hasUnsavedProgress && !isSavingProgress
              ? "bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)] animate-pulse"
              : "bg-[#24272c] hover:bg-[#2d3137] border border-[#3b3e45] text-[#f1f2f4]"
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
