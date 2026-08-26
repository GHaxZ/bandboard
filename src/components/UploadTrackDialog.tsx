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
import { Select } from "@/components/ui/select";
import { FileInput } from "@/components/ui/file-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { FormError } from "@/components/FormError";
import { cn } from "@/lib/utils";
import {
  INSTRUMENT_ROLES,
  ROLE_LABEL,
  MAX_UPLOAD_BYTES,
  ALLOWED_UPLOAD_MIMES,
  UPLOAD_ACCEPT,
  SONG_TYPE_BADGE,
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
    try {
      onUploaded(file, role, label.trim() || file.name);
      toast.success("Track added to draft");
    } catch (err) {
      console.error("UploadTrackDialog onUploaded failed:", err);
      toast.error("Failed to add stem to draft: " + String(err));
    }
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-[95vw]">
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
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              File
            </span>
            <FileInput accept={UPLOAD_ACCEPT} onChange={handleFileChange} />
            {file && (
              <p className="text-[10px] text-muted-foreground">
                {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
              </p>
            )}
            {warn && (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
                  SONG_TYPE_BADGE.original.border,
                  SONG_TYPE_BADGE.original.soft,
                  SONG_TYPE_BADGE.original.text
                )}
              >
                <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span className="leading-snug">{warn}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="stemRole"
              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
            >
              Role
            </Label>
            <Select id="stemRole" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {INSTRUMENT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="stemLabel"
              className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
            >
              Label (optional)
            </Label>
            <Input
              id="stemLabel"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Bass stem, Rhythm guitar..."
              className="rounded-xl"
            />
          </div>

          <FormError>{error}</FormError>

          <DialogFooter className="gap-2 sm:gap-0">
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
