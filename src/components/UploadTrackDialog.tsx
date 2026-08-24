"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/FormError";
import {
  INSTRUMENT_ROLES,
  ROLE_LABEL,
  MAX_UPLOAD_BYTES,
  ALLOWED_UPLOAD_MIMES,
  UPLOAD_ACCEPT,
  browserCanPlay,
} from "@/lib/constants";
import type { Role } from "@/lib/constants";

interface UploadTrackDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the selected file, role, and label; upload is deferred to the parent's Save All. */
  onUploaded: (file: File, role: Role, label: string) => void;
  defaultRole?: Role;
}

export function UploadTrackDialog({
  isOpen,
  onClose,
  onUploaded,
  defaultRole = "Guitar",
}: UploadTrackDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState<Role>(defaultRole);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Persistent playback-support notice; shown while an undecodable file is selected. */
  const [warn, setWarn] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setRole(defaultRole);
      setLabel("");
      setError(null);
      setWarn(null);
    }
  }, [isOpen, defaultRole]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError(null);
    setWarn(
      browserCanPlay(selected.type)
        ? null
        : `This browser can't decode ${selected.type || "this format"}. It will still upload fine, but playback here may not work.`
    );
    if (!label.trim()) {
      const nameWithoutExt = selected.name.replace(/\.[^.]+$/, "");
      setLabel(nameWithoutExt);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please select a file.");
      return;
    }
    if (!ALLOWED_UPLOAD_MIMES.includes(file.type)) {
      setError(`File type not allowed: ${file.type}`);
      return;
    }
    if (file.type.startsWith('video/')) {
      setError("Only audio files are allowed for stems.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB).`);
      return;
    }
    toast.success("Track added to draft");
    try {
      onUploaded(file, role, label.trim() || file.name);
    } catch (err) {
      console.error("UploadTrackDialog onUploaded failed:", err);
      toast.error("Failed to add stem to draft: " + String(err));
    }
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-[95vw] rounded-2xl p-6 bg-card border border-border text-foreground">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Upload className="w-5 h-5 text-muted-foreground" />
            Add Stem
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Upload an audio stem. Assign it a role so the practice mode knows which
            instrument to mute for you.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 my-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              File
            </Label>
            <input
              type="file"
              accept={UPLOAD_ACCEPT}
              onChange={handleFileChange}
              className="w-full text-xs text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-btn-bg file:text-foreground file:font-bold file:cursor-pointer file:hover:bg-btn-hover cursor-pointer bg-background border border-border rounded-xl p-2"
            />
            {file && (
              <p className="text-[10px] text-muted-foreground">
                {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
              </p>
            )}
            {warn && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-600/30 dark:border-amber-800 bg-amber-500/10 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span className="leading-snug">{warn}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Role
            </Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full bg-background border border-border text-foreground focus-visible:border-ring rounded-xl p-2 text-sm focus:outline-none h-10"
            >
              {INSTRUMENT_ROLES.map((r) => (
                <option key={r} value={r} className="bg-card">
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Label (optional)
            </Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Bass stem, Rhythm guitar..."
              className="bg-background border-border text-foreground focus-visible:border-ring rounded-xl"
            />
          </div>

          <FormError>{error}</FormError>

          <DialogFooter className="pt-3 border-t border-border gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl border border-transparent"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!file}
              className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl shadow-md font-bold px-5 flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" /> Add to Draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
