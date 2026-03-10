"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { informationText } from "@/lib/ui-information";
import { cn } from "@/lib/utils";

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    color?: string;
  };
};

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within <ChartContainer />");
  }
  return context;
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const variables = Object.entries(config)
    .filter(([, item]) => item.color)
    .map(([key, item]) => `  --color-${key}: ${item.color};`)
    .join("\n");

  if (!variables) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart="${id}"] {\n${variables}\n}`,
      }}
    />
  );
}

type ChartContainerProps = React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
};

function ChartContainer({ id, className, children, config, ...props }: ChartContainerProps) {
  const uniqueId = React.useId().replace(/:/g, "");
  const chartId = `chart-${id ?? uniqueId}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          "h-full w-full [&_.recharts-cartesian-grid_line]:stroke-border/60 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_*]:stroke-border/60",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

type ChartTooltipContentProps = React.ComponentProps<"div"> & {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number | string;
    color?: string;
    dataKey?: string;
  }>;
  label?: string;
  hideLabel?: boolean;
};

function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  hideLabel = false,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className={cn("rounded-md border border-border/80 bg-background px-2.5 py-1.5 shadow-sm", className)}>
      {!hideLabel && label ? <p className={cn("mb-1", informationText.l4Meta)}>{label}</p> : null}
      <div className="space-y-1">
        {payload.map((item, index) => {
          const key = String(item.dataKey ?? "value");
          const labelText = config[key]?.label ?? item.name ?? key;

          return (
            <div key={`${key}-${index}`} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-[2px]"
                  style={{ backgroundColor: item.color ?? `var(--color-${key})` }}
                />
                <span className={informationText.l4Meta}>{labelText}</span>
              </div>
              <span className={informationText.rowValue}>{item.value ?? "-"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { ChartContainer, ChartTooltip, ChartTooltipContent };

