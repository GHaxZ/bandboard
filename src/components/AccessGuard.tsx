"use client";

import { useEffect, useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { checkSecret, isSecretRequired } from "@/app/actions/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function AccessGuard({ children }: { children: React.ReactNode }) {
  const [isChecking, setIsChecking] = useState(true);
  const [isSecretNeeded, setIsSecretNeeded] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    async function checkAccess() {
      // 1. Capture token from URL search parameter
      const searchParams = new URLSearchParams(window.location.search);
      const secretParam = searchParams.get("secret");
      if (secretParam) {
        localStorage.setItem("bandboard_secret", secretParam);
        const newUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
      }

      // 2. Query server for authentication requirement
      const required = await isSecretRequired();
      setIsSecretNeeded(required);

      if (required) {
        const storedSecret = localStorage.getItem("bandboard_secret") || "";
        const auth = await checkSecret(storedSecret);
        setIsVerified(auth.isValid);
      } else {
        setIsVerified(true);
      }
      setIsChecking(false);
    }

    checkAccess();
  }, []);

  async function handleAuthenticate(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    const auth = await checkSecret(secretInput);
    if (auth.isValid) {
      localStorage.setItem("bandboard_secret", secretInput);
      setIsVerified(true);
    } else {
      setAuthError("Incorrect password token. Please try again.");
    }
  }

  if (isChecking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#5b80a5]" />
        <p className="text-sm font-semibold text-muted-foreground">Loading BandBoard...</p>
      </div>
    );
  }

  if (isSecretNeeded && !isVerified) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-foreground p-4">
        <Card className="max-w-md w-full border-border bg-card rounded-2xl shadow-2xl p-6">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 bg-muted/60 border border-dialog-border/50 rounded-2xl flex items-center justify-center mb-3">
              <Lock className="w-5 h-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl font-black tracking-tight text-foreground">Enter Shared Secret</CardTitle>
            <CardDescription className="text-muted-foreground mt-1 text-xs">
              Access is protected. Enter your band&apos;s shared secret token to view sheets and tracks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuthenticate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="secretToken" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Secret Password
                </Label>
                <Input
                  id="secretToken"
                  type="password"
                  required
                  placeholder="Enter shared secret..."
                  value={secretInput}
                  onChange={(e) => setSecretInput(e.target.value)}
                  className="bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
                />
              </div>

              {authError && <p className="text-xs font-semibold text-red-400 text-center">{authError}</p>}

              <Button type="submit" className="w-full bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl font-bold py-2.5">
                Unlock BandBoard
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
