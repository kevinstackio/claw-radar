"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import type { EChartsOption } from "echarts";
import { MapChart } from "echarts/charts";
import { TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import worldGeoJson from "echarts-countries-js/world-x.json";

echarts.use([MapChart, TooltipComponent, VisualMapComponent, CanvasRenderer]);
echarts.registerMap("world", worldGeoJson as unknown as Record<string, unknown>);

const countryExposureData = [
  { name: "United States", value: 82 },
  { name: "China", value: 61 },
  { name: "Germany", value: 41 },
  { name: "United Kingdom", value: 39 },
  { name: "India", value: 58 },
  { name: "Japan", value: 36 },
  { name: "Canada", value: 29 },
  { name: "Australia", value: 24 },
  { name: "Brazil", value: 34 },
  { name: "Russia", value: 31 },
  { name: "France", value: 33 },
  { name: "South Korea", value: 27 },
  { name: "Singapore", value: 16 },
  { name: "Netherlands", value: 21 },
  { name: "South Africa", value: 18 },
];

const option: EChartsOption = {
  tooltip: {
    trigger: "item",
    formatter: (params: { name: string; value?: number }) =>
      `${params.name}<br/>Exposed: ${params.value ?? 0}`,
  },
  visualMap: {
    min: 0,
    max: 90,
    calculable: true,
    orient: "horizontal",
    left: "center",
    bottom: 12,
    text: [],
    textStyle: { color: "#64748b", fontSize: 11 },
    inRange: {
      color: ["#c7e9f9", "#7dd3fc", "#38bdf8", "#0ea5e9", "#0369a1"],
    },
  },
  series: [
    {
      name: "Exposed Instances",
      type: "map",
      map: "world",
      roam: true,
      zoom: 0.9,
      top: 20,
      left: 12,
      right: 12,
      bottom: 56,
      selectedMode: false,
      itemStyle: {
        borderColor: "#93c5fd",
        borderWidth: 0.5,
      },
      emphasis: {
        label: { show: false },
        itemStyle: { areaColor: "#ef4444" },
      },
      data: countryExposureData,
    },
  ],
};

export function EchartsExposureChart() {
  const chartRef = useRef<HTMLDivElement>(null);

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
  }, []);

  return <div ref={chartRef} className="size-full" aria-label="Global exposure world map" />;
}
