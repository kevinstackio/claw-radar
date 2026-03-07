import { ExposureMapClient } from "@/components/exposure-map-client";
import { loadLatestExposureSnapshot } from "@/lib/exposure-snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const snapshot = await loadLatestExposureSnapshot();

  return (
    <section className="h-full min-h-0">
      <div className="h-full min-h-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <ExposureMapClient snapshot={snapshot} />
      </div>
    </section>
  );
}
