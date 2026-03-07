import { EchartsExposureChart } from "@/components/echarts-exposure-chart";

export default function Home() {
  return (
    <section className="h-full min-h-0">
      <div className="h-full min-h-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <EchartsExposureChart />
      </div>
    </section>
  );
}
