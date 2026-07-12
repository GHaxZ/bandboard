"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { checkSecret, setSecretCookie } from "@/app/actions/auth";

export default function UnlockPage() {
  return (
    <Suspense fallback={null}>
      <UnlockForm />
    </Suspense>
  );
}

function UnlockForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [secretInput, setSecretInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAuthenticate(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setIsSubmitting(true);
    try {
      const auth = await checkSecret(secretInput);
      if (auth.isValid) {
        await setSecretCookie(secretInput);
        router.replace(next);
        router.refresh();
      } else {
        setAuthError("Incorrect shared secret. Please try again.");
      }
    } catch (err) {
      console.error(err);
      setAuthError("Failed to verify secret. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-dvh bg-background text-foreground p-4">
      <Card className="max-w-md w-full border-border bg-card rounded-2xl shadow-2xl p-6">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-12 h-12 bg-muted/60 border border-dialog-border/50 rounded-2xl flex items-center justify-center mb-3">
            <Lock className="w-5 h-5 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl font-black tracking-tight text-foreground">
            Enter Shared Secret
          </CardTitle>
          <CardDescription className="text-muted-foreground mt-1 text-xs">
            Access is protected. Enter your band&apos;s shared secret to view setlists and tracks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuthenticate} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="secretToken"
                className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
              >
                Secret Password
              </Label>
              <Input
                id="secretToken"
                type="password"
                required
                autoFocus
                disabled={isSubmitting}
                placeholder="Enter shared secret..."
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                className="bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-[#5b80a5] rounded-xl"
              />
            </div>

            {authError && (
              <p className="text-xs font-semibold text-red-400 text-center">{authError}</p>
            )}

            <Button
              type="submit"
              disabled={isSubmitting || !secretInput.trim()}
              className="w-full bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl font-bold py-2.5"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : null}
              Unlock BandBoard
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
