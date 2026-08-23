import { Suspense } from "react";
import { isInviteRequired } from "@/app/actions/auth";
import { LoginForm } from "./LoginForm";

// Must evaluate per-request: BAND_SECRET can be set/unset without a rebuild,
// and a prerendered value would bake the wrong invite-gate into the form.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const inviteRequired = await isInviteRequired();
  return (
    <Suspense fallback={null}>
      <LoginForm inviteRequired={inviteRequired} />
    </Suspense>
  );
}
