import { getUserSettings } from "@/app/actions/user";
import { getUserUuid } from "@/lib/auth";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [settings, userUuid] = await Promise.all([getUserSettings(), getUserUuid()]);
  return <SettingsClient preferredInstrument={settings.preferredInstrument} userUuid={userUuid} />;
}
