import { getUserSettings } from "@/app/actions/user";
import { getSessionUser } from "@/lib/auth";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, user] = await Promise.all([getUserSettings(), getSessionUser()]);
  return (
    <SettingsClient preferredInstrument={settings.preferredInstrument} username={user?.username ?? ""} />
  );
}
