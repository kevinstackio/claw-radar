"use client";

import dynamic from "next/dynamic";

import type { ExposureSnapshot } from "@/lib/exposure-types";

type ExposureMapProps = {
  snapshot: ExposureSnapshot;
};

const ExposureMapClientNoSSR = dynamic(
  () => import("@/components/exposure-map-client").then((mod) => mod.ExposureMapClient),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
        Loading map...
      </div>
    ),
  }
);

export function ExposureMap({ snapshot }: ExposureMapProps) {
  return <ExposureMapClientNoSSR snapshot={snapshot} />;
}
