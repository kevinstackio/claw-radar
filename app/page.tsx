import { ExposureDashboard } from "@/components/exposure-dashboard";
import { loadLatestExposureSnapshot } from "@/lib/exposure-snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const snapshot = await loadLatestExposureSnapshot();

  return <ExposureDashboard snapshot={snapshot} />;
}
