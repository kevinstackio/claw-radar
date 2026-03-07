"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import type { EChartsOption } from "echarts";
import { BarChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

import type { ExposureSnapshot } from "@/lib/exposure-types";

echarts.use([BarChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

type CountryExposureBarChartProps = {
  snapshot: ExposureSnapshot;
};

export function CountryExposureBarChart({ snapshot }: CountryExposureBarChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  const option = useMemo<EChartsOption>(() => {
    const sorted = [...snapshot.countries].sort((a, b) => b.value - a.value);
    const countries = sorted.map((item) => item.name);
    const values = sorted.map((item) => item.value);
    const visibleCount = 18;
    const hasData = countries.length > 0;
    const endValue = hasData ? Math.min(visibleCount - 1, countries.length - 1) : 0;

    return {
      animationDuration: 450,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
      },
      grid: {
        top: 16,
        left: 56,
        right: 16,
        bottom: 16,
        containLabel: true,
      },
      xAxis: {
        type: "value",
        axisLabel: {
          fontSize: 10,
        },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: "#e2e8f0" } },
      },
      yAxis: {
        type: "category",
        data: countries,
        inverse: true,
        axisLabel: {
          interval: 0,
          fontSize: 10,
        },
        axisTick: { show: false },
      },
      dataZoom: [
        {
          type: "inside",
          yAxisIndex: 0,
          startValue: 0,
          endValue,
          zoomOnMouseWheel: false,
        },
        {
          type: "slider",
          yAxisIndex: 0,
          width: 10,
          right: 2,
          top: 16,
          bottom: 16,
          startValue: 0,
          endValue,
        },
      ],
      series: [
        {
          type: "bar",
          data: values,
          barMaxWidth: 14,
          itemStyle: {
            color: "#2563eb",
            borderRadius: [0, 4, 4, 0],
          },
          emphasis: {
            itemStyle: {
              color: "#1d4ed8",
            },
          },
        },
      ],
    };
  }, [snapshot.countries]);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current, undefined, { renderer: "canvas" });
    chart.setOption(option);

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(resize);
      observer.observe(chartRef.current);
    }

    return () => {
      window.removeEventListener("resize", resize);
      observer?.disconnect();
      chart.dispose();
    };
  }, [option]);

  return <div ref={chartRef} className="size-full" aria-label="Country exposure bar chart" />;
}
