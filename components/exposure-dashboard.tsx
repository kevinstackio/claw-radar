"use client";

import { CountryExposureBarChart } from "@/components/country-exposure-bar-chart";
import { ExposureMap } from "@/components/exposure-map";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatSnapshotDate } from "@/lib/datetime";
import type { ExposureSnapshot } from "@/lib/exposure-types";
import { informationLayout, informationText } from "@/lib/ui-information";
import { cn } from "@/lib/utils";

type ExposureDashboardProps = {
  snapshot: ExposureSnapshot;
};

export function ExposureDashboard({ snapshot }: ExposureDashboardProps) {
  const generatedAtLabel = formatSnapshotDate(snapshot.generatedAt);

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
                      <TabsTrigger value="notice">Notice</TabsTrigger>
                    </TabsList>

                    <TabsContent value="summary" className="mt-3 overflow-auto">
                      <div className={informationLayout.summaryList}>
                        <div className={informationLayout.summaryRow}>
                          <p className={informationText.rowLabel}>Total</p>
                          <p className={informationText.rowValue}>{snapshot.totalInstances}</p>
                        </div>
                        <div className={informationLayout.summaryRow}>
                          <p className={informationText.rowLabel}>Hits</p>
                          <p className={informationText.rowValue}>{snapshot.totalRecords}</p>
                        </div>
                        <div className={informationLayout.summaryRow}>
                          <p className={informationText.rowLabel}>Countries</p>
                          <p className={informationText.rowValue}>{snapshot.countries.length}</p>
                        </div>
                        <div className={informationLayout.summaryRow}>
                          <p className={informationText.rowLabel}>Updated</p>
                          <p className={cn(informationLayout.summaryValueWrap, informationText.rowValue)}>
                            {generatedAtLabel}
                          </p>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="notice" className="mt-3 overflow-auto">
                      <div className={cn(informationLayout.noticeBlock, informationText.l3Body)}>
                        <p className={informationText.l3Label}>Data Source</p>
                        <p>
                          This dashboard uses data from Netlas, a platform to discover, scan, and
                          monitor online assets.
                        </p>
                        <div className="flex justify-end">
                          <Button asChild variant="outline" size="sm">
                            <a href="https://netlas.io/" target="_blank" rel="noreferrer">
                              <span>Visit Netlas</span>
                            </a>
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle handleIcon="horizontal" handleClassName="h-4 w-8 rounded-sm" />

              <ResizablePanel defaultSize={62} minSize={35} className="min-h-0">
                <div className="h-full min-h-0 overflow-hidden bg-card/70">
                  <CountryExposureBarChart snapshot={snapshot} />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="z-[1400] w-px after:w-10"
            handleIcon="vertical"
            handleClassName="h-8 w-4 rounded-sm"
          />

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
