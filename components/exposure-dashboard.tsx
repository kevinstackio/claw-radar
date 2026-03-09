"use client";

import { CountryExposureBarChart } from "@/components/country-exposure-bar-chart";
import { ExposureMap } from "@/components/exposure-map";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { ExposureSnapshot } from "@/lib/exposure-types";

type ExposureDashboardProps = {
  snapshot: ExposureSnapshot;
};

export function ExposureDashboard({ snapshot }: ExposureDashboardProps) {
  const topCountries = [...snapshot.countries]
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const generatedAtLabel = snapshot.generatedAt
    ? new Date(snapshot.generatedAt).toLocaleString()
    : "No backup yet";

  return (
    <section className="h-full min-h-0">
      <div className="h-full min-h-0 overflow-hidden rounded-xl border bg-card">
        <ResizablePanelGroup direction="horizontal" className="h-full min-h-0 w-full">
          <ResizablePanel defaultSize={24} minSize={18} className="min-w-0">
            <ResizablePanelGroup direction="vertical" className="h-full min-h-0 w-full">
              <ResizablePanel defaultSize={38} minSize={20} className="min-h-0">
                <div className="h-full min-h-0 overflow-auto bg-card/70 p-4">
                  <p className="text-sm font-semibold">Exposure Snapshot</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="bg-muted/40 px-2 py-2">
                      <p className="text-[11px] uppercase tracking-wide">Public Records</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{snapshot.publicRecords}</p>
                    </div>
                    <div className="bg-muted/40 px-2 py-2">
                      <p className="text-[11px] uppercase tracking-wide">Countries</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{snapshot.countries.length}</p>
                    </div>
                    <div className="bg-muted/40 px-2 py-2">
                      <p className="text-[11px] uppercase tracking-wide">Plotted Points</p>
                      <p className="mt-1 text-sm font-medium text-foreground">{snapshot.points.length}</p>
                    </div>
                    <div className="bg-muted/40 px-2 py-2">
                      <p className="text-[11px] uppercase tracking-wide">Source File</p>
                      <p className="mt-1 truncate text-sm font-medium text-foreground">
                        {snapshot.sourceFile ?? "N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Top Countries</p>
                    <ul className="mt-2 space-y-1.5 text-xs">
                      {topCountries.map((country) => (
                        <li key={country.name} className="flex items-center justify-between">
                          <span className="truncate text-foreground/90">{country.name}</span>
                          <span className="text-muted-foreground">{country.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <p className="mt-4 truncate text-[11px] text-muted-foreground">Generated: {generatedAtLabel}</p>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel defaultSize={62} minSize={35} className="min-h-0">
                <div className="h-full min-h-0 overflow-hidden bg-card/70">
                  <CountryExposureBarChart snapshot={snapshot} />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle className="z-[1400] w-px after:w-10" />

          <ResizablePanel defaultSize={76} minSize={52} className="min-w-0">
            <div className="h-full min-h-0 overflow-hidden bg-card/70">
              <ExposureMap snapshot={snapshot} />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </section>
  );
}
