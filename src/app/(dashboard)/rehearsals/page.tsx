import { getRehearsals } from "@/app/actions/rehearsals";
import { RehearsalsDashboard } from "./RehearsalsDashboard";

export const dynamic = "force-dynamic";

export default async function RehearsalsPage() {
  const initialRehearsals = await getRehearsals();
  return <RehearsalsDashboard initialRehearsals={initialRehearsals} />;
}
