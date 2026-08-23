"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Settings as SettingsIcon,
  Sliders,
  CheckCircle,
  UserRound,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveUserSettings } from "@/app/actions/user";
import {
  logout,
  changeUsername,
  changePassword,
  deleteAccount,
} from "@/app/actions/auth";
import { INSTRUMENT_ROLES, ROLE_LABEL } from "@/lib/constants";
import type { Role } from "@/lib/constants";

interface SettingsClientProps {
  preferredInstrument: Role;
  username: string;
}

export function SettingsClient({ preferredInstrument, username }: SettingsClientProps) {
  const router = useRouter();
  const [instrument, setInstrument] = useState<Role>(preferredInstrument);
  const [savingInstrument, setSavingInstrument] = useState(false);

  const [newUsername, setNewUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleInstrumentChange(val: Role) {
    if (savingInstrument) return;
    const prev = instrument;
    setInstrument(val);
    setSavingInstrument(true);
    try {
      const res = await saveUserSettings({ preferredInstrument: val });
      if (!res.success) throw new Error(res.error);
      toast.success(`Role updated to ${ROLE_LABEL[val]}`);
    } catch (err) {
      console.error(err);
      setInstrument(prev);
      toast.error("Failed to update role. Please try again.");
    } finally {
      setSavingInstrument(false);
    }
  }

  async function handleUsernameChange(e: React.FormEvent) {
    e.preventDefault();
    if (savingUsername || !newUsername.trim()) return;
    setSavingUsername(true);
    try {
      const res = await changeUsername(newUsername);
      if (!res.success) throw new Error(res.error);
      toast.success("Username updated.");
      setNewUsername("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to update username.");
    } finally {
      setSavingUsername(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (savingPassword) return;
    setSavingPassword(true);
    try {
      const res = await changePassword(currentPassword, newPassword);
      if (!res.success) throw new Error(res.error);
      toast.success("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to update password.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleting) return;
    if (
      !window.confirm(
        "Really delete your account? All your progress, notes, markers, and settings will be permanently removed."
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await deleteAccount(deletePassword);
      if (!res.success) throw new Error(res.error);
      toast.success("Account deleted.");
      window.location.href = "/login";
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to delete account.");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-foreground flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-muted-foreground" />
          Settings &amp; Preferences
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5 font-medium">
          Customize your instrument settings and manage your account.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Instrument */}
        <Card className="border-border bg-card/40 rounded-2xl shadow-lg">
          <CardHeader>
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Sliders className="w-4 h-4 text-muted-foreground" />
              My Role (Instrument)
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Select your main role. When viewing a song dashboard, details for this instrument
              category will be shown by default.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {INSTRUMENT_ROLES.map((inst) => {
                const isSelected = instrument === inst;
                return (
                  <Button
                    key={inst}
                    variant={isSelected ? "default" : "outline"}
                    disabled={savingInstrument}
                    onClick={() => handleInstrumentChange(inst)}
                    className={`rounded-xl h-11 font-bold text-xs disabled:opacity-50 ${
                      isSelected
                        ? "bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground"
                        : "border-border bg-background/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {ROLE_LABEL[inst]}
                  </Button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background/40 border border-border p-3 rounded-xl leading-relaxed">
              <CheckCircle className="w-4 h-4 text-[#5b80a5] shrink-0" />
              <span>
                Your role is synced to your account as{" "}
                <strong className="font-bold text-foreground">{ROLE_LABEL[instrument]}</strong>.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Account */}
        <Card className="border-border bg-card/40 rounded-2xl shadow-lg">
          <CardHeader>
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <UserRound className="w-4 h-4 text-muted-foreground" />
              Account
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Signed in as <strong className="font-bold text-foreground">{username}</strong>. Your
              progress follows this account on every device you log in from.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleUsernameChange} className="space-y-2">
              <Label
                htmlFor="newUsername"
                className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
              >
                Change Username
              </Label>
              <div className="flex gap-2">
                <Input
                  id="newUsername"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="New username..."
                  disabled={savingUsername}
                  autoComplete="off"
                  className="bg-background border-border text-foreground text-xs px-3 focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl h-10"
                />
                <Button
                  type="submit"
                  disabled={savingUsername || !newUsername.trim()}
                  className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground text-xs font-bold px-4 h-10 rounded-xl flex-shrink-0 disabled:opacity-50"
                >
                  Save
                </Button>
              </div>
            </form>

            <form onSubmit={handlePasswordChange} className="space-y-2">
              <Label
                htmlFor="currentPassword"
                className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
              >
                Change Password
              </Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password..."
                disabled={savingPassword}
                autoComplete="current-password"
                className="bg-background border-border text-foreground text-xs px-3 focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl h-10"
              />
              <div className="flex gap-2">
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min. 8 chars)..."
                  disabled={savingPassword}
                  autoComplete="new-password"
                  className="bg-background border-border text-foreground text-xs px-3 focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl h-10"
                />
                <Button
                  type="submit"
                  disabled={savingPassword || !currentPassword || newPassword.length < 8}
                  className="bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground text-xs font-bold px-4 h-10 rounded-xl flex-shrink-0 disabled:opacity-50"
                >
                  Save
                </Button>
              </div>
            </form>

            <div className="pt-2 space-y-2 border-t border-border">
              <Label
                htmlFor="deletePassword"
                className="text-[10px] font-bold text-red-400 uppercase tracking-wider"
              >
                Danger Zone
              </Label>
              <div className="flex gap-2">
                <Input
                  id="deletePassword"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Confirm with your password..."
                  disabled={deleting}
                  autoComplete="current-password"
                  className="bg-background border-border text-foreground text-xs px-3 focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-red-500 rounded-xl h-10"
                />
                <Button
                  onClick={handleDeleteAccount}
                  disabled={deleting || !deletePassword}
                  className="border border-red-500/40 bg-red-950/30 hover:bg-red-900/40 text-red-300 text-xs font-bold px-4 h-10 rounded-xl flex-shrink-0 disabled:opacity-50"
                >
                  Delete Account
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  await logout();
                  window.location.href = "/login";
                }}
                className="border-border bg-background/40 text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl text-xs font-bold py-1.5 h-9"
              >
                Log Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
