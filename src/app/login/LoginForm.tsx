"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AudioLines, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { login, register } from "@/app/actions/auth";

interface LoginFormProps {
  inviteRequired: boolean;
}

export function LoginForm({ inviteRequired }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get("next");
  // Only allow internal redirect targets (prevents open redirect).
  const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordMismatch = mode === "register" && confirmPassword.length > 0 && password !== confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setIsSubmitting(true);
    try {
      const res =
        mode === "login"
          ? await login(username, password)
          : await register(username, password, confirmPassword, inviteCode);
      if (res.success) {
        router.replace(next);
        router.refresh();
      } else {
        setAuthError(res.error || "Something went wrong.");
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error(err);
      setAuthError("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="relative flex items-center justify-center min-h-dvh bg-background text-foreground p-4 overflow-hidden">
      {/* Tube-amber stage glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_38%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]"
      />
      <Card className="relative max-w-md w-full border-border bg-card rounded-2xl shadow-2xl p-6">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-12 h-12 bg-gradient-to-br from-primary to-accent-text text-primary-foreground rounded-2xl flex items-center justify-center mb-3 shadow-md shadow-primary/20">
            <AudioLines className="w-6 h-6" strokeWidth={2.5} />
          </div>
          <CardTitle className="text-2xl font-heading font-bold tracking-tight text-foreground">
            {mode === "login" ? "Log In" : "Create Account"}
          </CardTitle>
          {/* min-h reserves two lines so switching modes doesn't resize the card */}
          <CardDescription className="text-muted-foreground mt-1 text-xs min-h-[32px]">
            {mode === "login"
              ? "Sign in to access your songs, setlists, and practice progress."
              : "Pick a username and password. Your practice progress stays tied to your account across devices."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="username"
                className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
              >
                Username
              </Label>
              <Input
                id="username"
                type="text"
                required
                autoFocus
                autoComplete="username"
                disabled={isSubmitting}
                placeholder={mode === "register" ? "Choose a username" : "Your username"}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block h-10 bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-ring rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="password"
                className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
              >
                Password
              </Label>
              <Input
                id="password"
                type="password"
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                disabled={isSubmitting}
                placeholder={mode === "register" ? "Minimum 8 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block h-10 bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-ring rounded-xl"
              />
            </div>

            {mode === "register" && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="confirmPassword"
                  className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                >
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block h-10 bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-ring rounded-xl"
                />
                {/* Always rendered so the mismatch hint never pushes content around */}
                <p className={`text-xs font-semibold ${passwordMismatch ? "text-destructive" : "invisible"}`}>
                  {passwordMismatch ? "Passwords do not match." : "\u00A0"}
                </p>
              </div>
            )}

            {mode === "register" && inviteRequired && (
              <div className="space-y-1.5">
                <Label
                  htmlFor="inviteCode"
                  className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider"
                >
                  Band Invite Code
                </Label>
                <Input
                  id="inviteCode"
                  type="password"
                  required
                  disabled={isSubmitting}
                  placeholder="Ask your band admin for the code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="block h-10 bg-background border-border text-foreground focus-visible:ring-ring focus-visible:ring-1 focus-visible:border-ring rounded-xl"
                />
              </div>
            )}

            {/* Reserved slot: appearing errors must not shift the button below */}
            <p
              aria-live="polite"
              className={`text-xs font-semibold text-center min-h-[20px] ${authError ? "text-destructive" : "invisible"}`}
            >
              {authError || "\u00A0"}
            </p>

            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !username.trim() ||
                !password ||
                (mode === "register" && password !== confirmPassword)
              }
              className="w-full h-11 bg-btn-bg hover:bg-btn-hover border border-dialog-border text-foreground rounded-xl font-bold"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              {mode === "login" ? "Log In" : "Create Account"}
            </Button>

            {/* Full-width 44px target — tappable on phones, unlike a text link */}
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setAuthError("");
                setConfirmPassword("");
              }}
              className="w-full h-11 border-border bg-background/40 hover:bg-muted text-muted-foreground hover:text-foreground rounded-xl font-bold text-xs"
            >
              {mode === "login"
                ? "No account yet? Create one"
                : "Already have an account? Log in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
