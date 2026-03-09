"use client";

import { useMemo, useState } from "react";
import { BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { ChartContainer, type ChartConfig, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import type { CountryExposure, ExposureSnapshot } from "@/lib/exposure-types";

type CountryExposureBarChartProps = {
  snapshot: ExposureSnapshot;
};

type ChartMode = "pie" | "bar";

// Temporary preview dataset used only when real data is not available yet.
const PREVIEW_COUNTRIES: CountryExposure[] = [
  { name: "United States", value: 428 },
  { name: "Germany", value: 266 },
  { name: "Singapore", value: 211 },
  { name: "Netherlands", value: 187 },
  { name: "France", value: 168 },
  { name: "United Kingdom", value: 151 },
  { name: "Japan", value: 134 },
  { name: "Canada", value: 112 },
  { name: "India", value: 96 },
  { name: "Brazil", value: 84 },
  { name: "Australia", value: 63 },
  { name: "South Korea", value: 58 },
  { name: "Spain", value: 49 },
  { name: "Italy", value: 42 },
  { name: "Poland", value: 31 },
  { name: "Turkey", value: 27 },
  { name: "Mexico", value: 23 },
  { name: "Sweden", value: 19 },
];

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
  c6: { label: "Others", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

const PIE_COLORS = [
  "var(--color-c1)",
  "var(--color-c2)",
  "var(--color-c3)",
  "var(--color-c4)",
  "var(--color-c5)",
  "var(--color-c6)",
];

export function CountryExposureBarChart({ snapshot }: CountryExposureBarChartProps) {
  const [mode, setMode] = useState<ChartMode>("pie");

  const hasRealData = useMemo(
    () => snapshot.countries.some((item) => Number.isFinite(item.value) && item.value > 0),
    [snapshot.countries]
  );

  const countries = useMemo(() => {
    const source = hasRealData ? snapshot.countries : PREVIEW_COUNTRIES;
    return source
      .filter((item) => Number.isFinite(item.value) && item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [hasRealData, snapshot.countries]);

  const hasData = countries.length > 0;

  const pieData = useMemo(() => {
    const topFive = countries.slice(0, 5).map((item) => ({ name: item.name, value: item.value }));
    const othersValue = countries.slice(5).reduce((acc, item) => acc + item.value, 0);

    if (othersValue > 0) {
      topFive.push({ name: "Others", value: othersValue });
    }

    return topFive;
  }, [countries]);

  const barData = useMemo(
    () => countries.map((item) => ({ country: item.name, records: item.value })),
    [countries]
  );

  const title = mode === "pie" ? "Country Exposure Share" : "Country Exposure Count";
  const subtitle = mode === "pie" ? "Top 5 countries + Others" : "Bars by country on Y-axis";

  return (
    <div className="relative size-full">
      <div className="absolute left-3 top-3 z-20">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>

      <div className="absolute right-3 top-3 z-20 inline-flex h-9 items-center gap-1 rounded-md border border-border/80 bg-background/95 p-1 text-muted-foreground shadow-sm">
        <Button
          type="button"
          size="icon-xs"
          className="h-7 w-7 rounded-sm"
          variant={mode === "pie" ? "secondary" : "ghost"}
          onClick={() => setMode("pie")}
          title="Pie chart"
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
          title="Bar chart"
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
        <ChartContainer config={pieChartConfig} className="h-full w-full pt-10">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="57%"
              outerRadius="62%"
              innerRadius={0}
              isAnimationActive
            >
              {pieData.map((entry, index) => (
                <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
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
              tick={{ fontSize: 10 }}
            />
            <YAxis
              dataKey="country"
              type="category"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              width={92}
              tick={{ fontSize: 10 }}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="records" fill="var(--color-records)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}

