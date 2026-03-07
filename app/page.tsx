import { CountryExposureBarChart } from "@/components/country-exposure-bar-chart";
import { ExposureMap } from "@/components/exposure-map";
import { loadLatestExposureSnapshot } from "@/lib/exposure-snapshot";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const snapshot = await loadLatestExposureSnapshot();

  return (
    <section className="h-full min-h-0">
      <div className="flex h-full min-h-0 flex-row gap-5">
        <div
          className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm"
          style={{ width: "calc((100% - 20px) * 0.2)" }}
        >
          <CountryExposureBarChart snapshot={snapshot} />
        </div>
        <div
          className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm"
          style={{ width: "calc((100% - 20px) * 0.8)" }}
        >
          <ExposureMap snapshot={snapshot} />
        </div>
      </div>
    </section>
  );
}
