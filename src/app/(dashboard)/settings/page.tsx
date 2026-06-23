import { getUserSettings, getUserUuid } from "@/app/actions/user";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const dbSettings = await getUserSettings();
  const userUuid = await getUserUuid();
  const preferredInstrument = dbSettings?.preferredInstrument || "Guitar";

  return (
    <SettingsClient
      preferredInstrument={preferredInstrument}
      userUuid={userUuid}
    />
  );
}
