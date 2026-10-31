import { Suspense } from "react";
import { getRegistrationStatus } from "@/app/actions/auth";
import { LoginForm } from "./LoginForm";
import { getSessionUser } from "@/lib/auth";
import { safeNext } from "@/lib/navigation";
import { redirect } from "next/navigation";

// Must evaluate per-request: BAND_SECRET can be set/unset without a rebuild,
// and a prerendered value would bake the wrong invite-gate into the form.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  if (await getSessionUser()) {
    const { next } = await searchParams;
    const target = safeNext(typeof next === "string" ? next : null);
    // Avoid a redirect loop for a login link pointing back to this page.
    const pathname = new URL(target, "http://bandboard.local").pathname;
    redirect(pathname === "/login" || pathname === "/login/" ? "/" : target);
  }
  const registration = await getRegistrationStatus();
  return (
    <Suspense fallback={null}>
      <LoginForm inviteRequired={registration.inviteRequired} registrationEnabled={registration.enabled} />
    </Suspense>
  );
}
