"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  Sliders,
  CheckCircle,
  Lock,
  RefreshCw,
  Copy,
  Check,
  Download,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveUserSettings,
  exportUserData,
  importUserData,
} from "@/app/actions/user";

interface SettingsClientProps {
  preferredInstrument: string;
  userUuid: string;
}

export function SettingsClient({ preferredInstrument, userUuid }: SettingsClientProps) {
  const [instrument, setInstrument] = useState(preferredInstrument);
  const [userUuidState, setUserUuidState] = useState(userUuid);
  const [copySuccess, setCopySuccess] = useState(false);
  const [syncIdInput, setSyncIdInput] = useState("");
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    // Sync with localStorage just in case the cookie is unpopulated or out of sync
    if (userUuid === "anonymous" || !userUuid) {
      const stored = localStorage.getItem("band_orchestrator_uid");
      if (stored) {
        setUserUuidState(stored);
      }
    }
  }, [userUuid]);

  async function handleInstrumentChange(val: string) {
    setInstrument(val);
    await saveUserSettings(val);
    toast.success(`Role updated to ${val}`);
  }

  const handleCopyId = () => {
    if (typeof navigator !== "undefined" && userUuidState) {
      navigator.clipboard.writeText(userUuidState);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      toast.success("Device ID copied to clipboard!");
    }
  };

  const handleSyncId = () => {
    setSyncError("");
    const trimmed = syncIdInput.trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmed)) {
      setSyncError("Invalid Device ID format. Must be a valid UUID v4.");
      return;
    }

    localStorage.setItem("band_orchestrator_uid", trimmed);
    document.cookie = `band_orchestrator_uid=${trimmed}; path=/; max-age=${60 * 60 * 24 * 365 * 10}; SameSite=Lax`;
    toast.success("Device ID synchronized! Reloading page...");
    window.location.reload();
  };

  const handleExportProfile = async () => {
    const result = await exportUserData();
    if (result.success && result.data) {
      const dataStr = JSON.stringify(result.data, null, 2);
      const dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);
      const exportFileDefaultName = `bandboard_profile_${userUuidState.substring(0, 8)}.json`;
      const linkElement = document.createElement("a");
      linkElement.setAttribute("href", dataUri);
      linkElement.setAttribute("download", exportFileDefaultName);
      linkElement.click();
      toast.success("Profile exported successfully!");
    } else {
      toast.error("Export failed: " + (result.error || "Unknown error"));
    }
  };

  const handleImportProfile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = async (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (!parsed.band_orchestrator_uid) {
            toast.error("Invalid file: No Device ID found.");
            return;
          }

          const res = await importUserData(parsed);
          if (res.success && res.userUuid) {
            localStorage.setItem("band_orchestrator_uid", res.userUuid);
            document.cookie = `band_orchestrator_uid=${res.userUuid}; path=/; max-age=${60 * 60 * 24 * 365 * 10}; SameSite=Lax`;
            toast.success("Profile imported successfully!");
            window.location.reload();
          } else {
            toast.error("Import failed: " + (res.error || "Database error"));
          }
        } catch (err) {
          toast.error("Failed to parse file as JSON.");
        }
      };
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-foreground flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-muted-foreground" />
          Settings & Preferences
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5 font-medium">
          Customize your instrument settings and view identity preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Instrument Setting */}
        <Card className="border-border bg-card/40 rounded-2xl shadow-lg">
          <CardHeader>
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Sliders className="w-4 h-4 text-muted-foreground" />
              My Role (Instrument)
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Select your main role. When viewing a song dashboard, details for this instrument category will be shown by default.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {["Guitar", "Bass", "Drums", "Vocals", "Piano/Keyboard", "Other"].map((inst) => {
                const isSelected = instrument.toLowerCase() === inst.toLowerCase();
                return (
                  <Button
                    key={inst}
                    variant={isSelected ? "default" : "outline"}
                    onClick={() => handleInstrumentChange(inst)}
                    className={`rounded-xl h-11 font-bold text-xs ${
                      isSelected
                        ? "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground border-0"
                        : "border-border bg-background/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {inst}
                  </Button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background/40 border border-border p-3 rounded-xl leading-relaxed">
              <CheckCircle className="w-4 h-4 text-[#5b80a5] shrink-0" />
              <span>
                Your role is saved locally on this device as{" "}
                <strong className="font-bold text-foreground">{instrument}</strong>.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Shared Secret Settings */}
        <Card className="border-border bg-card/40 rounded-2xl shadow-lg">
          <CardHeader>
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground" />
              Authentication Secret
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Manage your access token for this deployment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                If your band administrator has set an access password, you must be logged in to view setlists. You are currently authenticated.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  localStorage.removeItem("bandboard_secret");
                  toast.success("Secret token cleared. Logging out...");
                  window.location.reload();
                }}
                className="border-border bg-background/40 text-red-400 hover:bg-red-950/20 hover:text-red-300 rounded-xl text-xs font-bold py-1.5 h-9"
              >
                Clear Saved Secret (Log Out)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Practice Sync & Backup Card */}
      <Card className="border-border bg-card/40 rounded-2xl shadow-lg">
        <CardHeader>
          <CardTitle className="text-base font-bold text-[#f1f2f4] flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
            Practice Data & Device Sync
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Your practice speed preferences, learning logs, and notes are automatically saved under your anonymous ID. Sync this ID or import/export files to share settings across multiple devices and browsers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Identity Display */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Your Anonymous Device ID</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-background border border-border text-xs text-[#5b80a5] font-mono px-4 py-3 rounded-xl select-all break-all leading-normal">
                {userUuidState || "Generating..."}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyId}
                className="h-11 w-11 border-border bg-background/40 hover:bg-muted rounded-xl flex-shrink-0 text-muted-foreground hover:text-foreground"
                title="Copy Device ID"
              >
                {copySuccess ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Sync Section */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Sync Another Device</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Paste another device's ID..."
                  value={syncIdInput}
                  onChange={(e) => setSyncIdInput(e.target.value)}
                  className="bg-background border-border text-foreground text-xs px-3 focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl h-10"
                />
                <Button
                  onClick={handleSyncId}
                  className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground text-xs font-bold px-4 h-10 rounded-xl flex-shrink-0"
                >
                  Sync ID
                </Button>
              </div>
              {syncError && <p className="text-xs text-red-400 font-semibold">{syncError}</p>}
            </div>

            {/* Backup/Import Section */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Backup &amp; Import Profile</label>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleExportProfile}
                  variant="outline"
                  className="border-border bg-background/40 hover:bg-muted text-xs font-bold text-[#acd1f8] hover:text-foreground py-2 h-10 px-4 rounded-xl flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Profile
                </Button>
                
                <div className="relative">
                  <input
                    type="file"
                    accept=".json"
                    id="profile-import-file"
                    onChange={handleImportProfile}
                    className="hidden"
                  />
                  <Button
                    onClick={() => document.getElementById("profile-import-file")?.click()}
                    variant="outline"
                    className="border-border bg-background/40 hover:bg-muted text-xs font-bold text-[#acd1f8] hover:text-foreground py-2 h-10 px-4 rounded-xl flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Import Profile
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
