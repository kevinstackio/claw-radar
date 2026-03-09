"use client";

import { CountryExposureBarChart } from "@/components/country-exposure-bar-chart";
import { ExposureMap } from "@/components/exposure-map";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ExposureSnapshot } from "@/lib/exposure-types";
import { formatSnapshotTimestamp } from "@/lib/datetime";

type ExposureDashboardProps = {
  snapshot: ExposureSnapshot;
};

export function ExposureDashboard({ snapshot }: ExposureDashboardProps) {
  const generatedAtLabel = formatSnapshotTimestamp(snapshot.generatedAt);

  return (
    <section className="h-full min-h-0">
      <div className="h-full min-h-0 overflow-hidden rounded-xl border bg-card">
        <ResizablePanelGroup direction="horizontal" className="h-full min-h-0 w-full">
          <ResizablePanel defaultSize={24} minSize={18} className="min-w-0">
            <ResizablePanelGroup direction="vertical" className="h-full min-h-0 w-full">
              <ResizablePanel defaultSize={38} minSize={20} className="min-h-0">
                <div className="h-full min-h-0 overflow-hidden bg-card/70 p-4">
                  <Tabs defaultValue="summary" className="h-full min-h-0">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="summary">Summary</TabsTrigger>
                      <TabsTrigger value="source">Source</TabsTrigger>
                    </TabsList>

                    <TabsContent value="summary" className="mt-3 overflow-auto">
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide">Total Records</p>
                          <p className="text-sm font-medium text-foreground">{snapshot.totalRecords}</p>
                        </div>
                        <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide">Countries</p>
                          <p className="text-sm font-medium text-foreground">{snapshot.countries.length}</p>
                        </div>
                        <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
                          <p className="text-[11px] uppercase tracking-wide">Updated</p>
                          <p className="max-w-[58%] truncate text-right text-sm font-medium text-foreground">
                            {generatedAtLabel}
                          </p>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="source" className="mt-3 overflow-auto">
                      <div className="space-y-2 text-sm font-medium leading-relaxed text-foreground">
                        <p>
                          Current data is aggregated from public indexing sources, including Netlas and
                          OpenClaw-related queries.
                        </p>
                        <p>Always follow responsible disclosure practices and protect your own systems.</p>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle handleIcon="horizontal" handleClassName="h-4 w-8 rounded-[5px]" />

              <ResizablePanel defaultSize={62} minSize={35} className="min-h-0">
                <div className="h-full min-h-0 overflow-hidden bg-card/70">
                  <CountryExposureBarChart snapshot={snapshot} />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle className="z-[1400] w-px after:w-10" handleIcon="vertical" handleClassName="h-8 w-4 rounded-[5px]" />

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





