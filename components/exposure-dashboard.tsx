"use client";

import { Info } from "lucide-react";

import { CountryExposureBarChart } from "@/components/country-exposure-bar-chart";
import { ExposureMap } from "@/components/exposure-map";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatSnapshotTime } from "@/lib/datetime";
import type { ExposureSnapshot } from "@/lib/exposure-types";
import { informationLayout, informationText } from "@/lib/ui-information";
import { cn } from "@/lib/utils";

type ExposureDashboardProps = {
  snapshot: ExposureSnapshot;
};

const numberFormatter = new Intl.NumberFormat("en-US");

export function ExposureDashboard({ snapshot }: ExposureDashboardProps) {
  const generatedAtLabel = formatSnapshotTime(snapshot.generatedAt);
  const summaryItems = [
    {
      title: "INSTANCES",
      tip: "Unique publicly exposed instances.",
      value: numberFormatter.format(snapshot.totalInstances),
    },
    {
      title: "SEEN",
      tip: "How many times matching assets were observed by scans.",
      value: numberFormatter.format(snapshot.totalRecords),
    },
    {
      title: "COUNTRIES",
      tip: "Number of countries with observed exposure.",
      value: numberFormatter.format(snapshot.countries.length),
    },
    {
      title: "UPDATED",
      tip: "Latest successful sync start time.",
      value: generatedAtLabel,
    },
  ];

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
                      <TooltipProvider delayDuration={120}>
                        <div className={informationLayout.summaryList}>
                          {summaryItems.map((item) => (
                            <div key={item.title} className={informationLayout.summaryRow}>
                              <div className={informationLayout.summaryLabelWrap}>
                                <p className={informationText.rowLabel}>{item.title}</p>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className={informationLayout.summaryHelpTrigger}
                                      aria-label={`More information about ${item.title}`}
                                    >
                                      <Info className="h-2.5 w-2.5" strokeWidth={1.9} />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">{item.tip}</TooltipContent>
                                </Tooltip>
                              </div>
                              <p className={cn(informationLayout.summaryValueWrap, informationText.rowValue)}>
                                {item.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      </TooltipProvider>
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
