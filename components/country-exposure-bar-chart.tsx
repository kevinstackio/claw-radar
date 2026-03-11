"use client";

import { useMemo, useState } from "react";
import { BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { ChartContainer, type ChartConfig, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import type { ExposureSnapshot } from "@/lib/exposure-types";
import { informationChart, informationLayout, informationText } from "@/lib/ui-information";
import { cn } from "@/lib/utils";

type CountryExposureBarChartProps = {
  snapshot: ExposureSnapshot;
};

type ChartMode = "pie" | "bar";
type PieChartDatum = {
  name: string;
  value: number;
  color: string;
};

type PieTooltipPayloadItem = {
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Partial<PieChartDatum>;
};

const barChartConfig = {
  records: {
    label: "Records",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const pieChartConfig = {
  value: {
    label: "Records",
    color: "var(--chart-1)",
  },
  c1: { label: "Slice 1", color: "var(--chart-1)" },
  c2: { label: "Slice 2", color: "var(--chart-2)" },
  c3: { label: "Slice 3", color: "var(--chart-3)" },
  c4: { label: "Slice 4", color: "var(--chart-4)" },
  c5: { label: "Slice 5", color: "var(--chart-5)" },
  c6: { label: "Others", color: "var(--muted)" },
} satisfies ChartConfig;

const PIE_COLORS = [
  "var(--color-c1)",
  "var(--color-c2)",
  "var(--color-c3)",
  "var(--color-c4)",
  "var(--color-c5)",
  "var(--color-c6)",
];

function PieCountryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: PieTooltipPayloadItem[];
}) {
  const item = payload?.[0];
  const country = (() => {
    if (typeof item?.payload?.name === "string" && item.payload.name.trim().length > 0) {
      return item.payload.name;
    }
    if (typeof item?.name === "string" && item.name.trim().length > 0) {
      return item.name;
    }
    return "Unknown";
  })();
  const count =
    typeof item?.payload?.value === "number"
      ? item.payload.value.toLocaleString()
      : typeof item?.value === "number"
      ? item.value.toLocaleString()
      : typeof item?.value === "string" && item.value.trim().length > 0
      ? item.value
      : "-";
  const markerColor = item?.payload?.color ?? item?.color ?? "var(--muted-foreground)";

  if (!active || !item) {
    return null;
  }

  return (
    <div className="rounded-md border border-border/80 bg-background px-2.5 py-1.5 shadow-sm">
      <p className={cn("mb-1", informationText.l3Label)}>{country}</p>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-[2px]" style={{ backgroundColor: markerColor }} />
          <span className={informationText.l4Meta}>Records</span>
        </div>
        <span className={informationText.rowValue}>{count}</span>
      </div>
    </div>
  );
}

export function CountryExposureBarChart({ snapshot }: CountryExposureBarChartProps) {
  const [mode, setMode] = useState<ChartMode>("pie");

  const countries = useMemo(() => {
    return snapshot.countries
      .filter((item) => Number.isFinite(item.value) && item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [snapshot.countries]);

  const hasData = countries.length > 0;

  const pieData = useMemo<PieChartDatum[]>(() => {
    const topFive = countries.slice(0, 5).map((item, index) => ({
      name: item.name,
      value: item.value,
      color: PIE_COLORS[index % PIE_COLORS.length],
    }));
    const othersValue = countries.slice(5).reduce((acc, item) => acc + item.value, 0);

    if (othersValue > 0) {
      topFive.push({
        name: "Others",
        value: othersValue,
        color: PIE_COLORS[topFive.length % PIE_COLORS.length],
      });
    }

    return topFive;
  }, [countries]);

  const barData = useMemo(
    () => countries.map((item) => ({ country: item.name, records: item.value })),
    [countries]
  );

  const title = mode === "pie" ? "Exposure Share" : "Exposure Count";
  const subtitle = mode === "pie" ? "Top 5 countries + Others" : "Ranking of all countries";

  return (
    <div className="relative size-full">
      <div className="absolute left-3 top-3 z-20">
        <p className={informationLayout.sectionTitle}>{title}</p>
        <p className={informationLayout.sectionSubtitle}>{subtitle}</p>
      </div>

      <div className="absolute right-3 top-3 z-20 inline-flex h-9 items-center gap-1 rounded-md border border-border/80 bg-background/95 p-1 text-muted-foreground shadow-sm">
        <Button
          type="button"
          size="icon-xs"
          className="h-7 w-7 rounded-sm"
          variant={mode === "pie" ? "secondary" : "ghost"}
          onClick={() => setMode("pie")}
          aria-label="Switch to pie chart"
        >
          <PieChartIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          className="h-7 w-7 rounded-sm"
          variant={mode === "bar" ? "secondary" : "ghost"}
          onClick={() => setMode("bar")}
          aria-label="Switch to bar chart"
        >
          <BarChart3 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {!hasData ? (
        <EmptyState
          title="No chart data"
          description="Country exposure data has not been generated yet."
        />
      ) : mode === "pie" ? (
        <ChartContainer config={pieChartConfig} className="h-full w-full pt-14">
          <PieChart>
            <Legend
              align="center"
              verticalAlign="top"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: informationChart.legendFontSize, color: "var(--color-muted-foreground)", paddingTop: 2 }}
              formatter={(value) => <span className={informationText.l3Label}>{value}</span>}
            />
            <ChartTooltip cursor={false} content={<PieCountryTooltip />} />
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              startAngle={90}
              endAngle={-270}
              cx="50%"
              cy={informationChart.pieCenterY}
              outerRadius={informationChart.pieOuterRadius}
              innerRadius={0}
              isAnimationActive
            >
              {pieData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      ) : (
        <ChartContainer config={barChartConfig} className="h-full w-full pt-10">
          <BarChart layout="vertical" data={barData} margin={{ top: 16, right: 16, left: 8, bottom: 16 }}>
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: informationChart.axisFontSize, fill: "var(--color-muted-foreground)" }}
            />
            <YAxis
              dataKey="country"
              type="category"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={informationChart.yAxisWidth}
              tick={{ fontSize: informationChart.axisFontSize, fill: "var(--color-muted-foreground)" }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="records" fill="var(--color-records)" radius={informationChart.barRadius} />
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}
