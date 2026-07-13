"use client";

import { useState, useEffect, useRef } from "react";
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
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import {
  INSTRUMENT_ROLES,
  ROLE_LABEL,
  MAX_UPLOAD_BYTES,
  ALLOWED_UPLOAD_MIMES,
} from "@/lib/constants";
import type { Role } from "@/lib/constants";
import type { CustomTrack } from "@/types/models";

interface UploadTrackDialogProps {
  songId: string;
  isOpen: boolean;
  onClose: () => void;
  onUploaded: (track: CustomTrack) => void;
  defaultRole?: Role;
}

export function UploadTrackDialog({
  songId,
  isOpen,
  onClose,
  onUploaded,
  defaultRole = "Guitar",
}: UploadTrackDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState<Role>(defaultRole);
  const [label, setLabel] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setRole(defaultRole);
      setLabel("");
      setError(null);
    }
  }, [isOpen, defaultRole]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError(null);
    if (!label.trim()) {
      const nameWithoutExt = selected.name.replace(/\.[^.]+$/, "");
      setLabel(nameWithoutExt);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
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
      setError("File too large (max 100MB).");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("songId", songId);
      form.append("role", role);
      form.append("label", label.trim() || file.name);
      form.append("file", file);
      form.append("kind", "stem");

      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      toast.success("Track uploaded successfully!");
      onUploaded(data.track);
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isUploading && onClose()}>
      <DialogContent className="max-w-md w-[95vw] rounded-2xl p-6 bg-card border border-border text-foreground">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Upload className="w-5 h-5 text-muted-foreground" />
            Upload Custom Track
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Upload an audio or video stem. Assign it a role so the practice mode knows which
            instrument to mute for you.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 my-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              File
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              disabled={isUploading}
              className="w-full text-xs text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-btn-bg file:text-foreground file:font-bold file:cursor-pointer file:hover:bg-btn-hover cursor-pointer bg-background border border-border rounded-xl p-2"
            />
            {file && (
              <p className="text-[10px] text-muted-foreground">
                {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Role
            </Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={isUploading}
              className="w-full bg-background border border-border text-foreground focus:ring-1 focus:ring-ring focus:border-[#5b80a5] rounded-xl p-2 text-sm focus:outline-none h-10"
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
              disabled={isUploading}
              placeholder="e.g. Bass stem, Rhythm guitar..."
              className="bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
            />
          </div>

          {error && (
            <div className="text-xs font-semibold text-red-400 bg-red-950/20 border border-red-900/30 rounded-xl p-3 leading-relaxed">
              {error}
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-border gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              disabled={isUploading}
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl border border-transparent"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isUploading || !file}
              className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl shadow-md font-bold px-5 flex items-center gap-1.5"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" /> Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
