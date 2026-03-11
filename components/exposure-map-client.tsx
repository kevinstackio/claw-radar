"use client";

import type { CircleMarker as LeafletCircleMarker } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

import { formatSnapshotDate } from "@/lib/datetime";
import type { ExposureSnapshot } from "@/lib/exposure-types";
import {
  IP_SEARCH_EVENT,
  type IpSearchResult,
} from "@/lib/ip-search";
import { informationLayout, informationText } from "@/lib/ui-information";
import { cn } from "@/lib/utils";

type ExposureMapClientProps = {
  snapshot: ExposureSnapshot;
};

type PlottedPoint = ExposureSnapshot["points"][number] & {
  lat: number;
  lon: number;
  count: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isValidCoordinate(lat: number, lon: number) {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function MapSelectionController({ target }: { target: PlottedPoint | null }) {
  const map = useMap();

  useEffect(() => {
    if (!target) {
      return;
    }

    const nextZoom = Math.max(map.getZoom(), 5);
    map.flyTo([target.lat, target.lon], nextZoom, {
      duration: 0.9,
    });
  }, [map, target]);

  return null;
}

export function ExposureMapClient({ snapshot }: ExposureMapClientProps) {
  const [searchResult, setSearchResult] = useState<IpSearchResult | null>(null);
  const markerRefs = useRef<Record<string, LeafletCircleMarker>>({});

  useEffect(() => {
    const handleIpSearch = (event: Event) => {
      const detail = (event as CustomEvent<IpSearchResult>).detail;
      if (!detail || typeof detail.message !== "string") {
        return;
      }
      setSearchResult(detail);
    };

    window.addEventListener(IP_SEARCH_EVENT, handleIpSearch as EventListener);
    return () => {
      window.removeEventListener(IP_SEARCH_EVENT, handleIpSearch as EventListener);
    };
  }, []);

  const plottedPoints = useMemo(
    () =>
      snapshot.points
        .map((point) => {
          const [lon, lat, count] = point.value;
          if (!isValidCoordinate(lat, lon)) {
            return null;
          }
          return {
            ...point,
            lat,
            lon,
            count: Number.isFinite(count) ? count : 1,
          };
        })
        .filter((point): point is PlottedPoint => point !== null),
    [snapshot.points]
  );

  const matchedPoint = useMemo(() => {
    if (!searchResult || searchResult.status !== "matched") {
      return null;
    }
    return plottedPoints.find((point) => point.ip === searchResult.ip) ?? null;
  }, [plottedPoints, searchResult]);

  const matchedPointKey = matchedPoint
    ? `${matchedPoint.ip}-${matchedPoint.lat}-${matchedPoint.lon}`
    : null;

  const generatedAtLabel = formatSnapshotDate(snapshot.generatedAt);

  useEffect(() => {
    if (!matchedPointKey) {
      return;
    }

    let stopped = false;
    let retries = 0;

    const openPopup = () => {
      if (stopped) {
        return;
      }

      const marker = markerRefs.current[matchedPointKey];
      if (marker) {
        marker.openPopup();
        return;
      }

      retries += 1;
      if (retries < 20) {
        window.setTimeout(openPopup, 60);
      }
    };

    openPopup();

    return () => {
      stopped = true;
    };
  }, [matchedPointKey]);

  return (
    <div className="relative size-full overflow-hidden">
      <MapContainer
        zoomControl={false}
        attributionControl={false}
        center={[20, 0]}
        zoom={2}
        minZoom={2}
        maxZoom={10}
        worldCopyJump
        className="size-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapSelectionController target={matchedPoint} />

        {plottedPoints.map((point) => {
          const isSelected = matchedPoint?.ip === point.ip;
          const pointKey = `${point.ip}-${point.lat}-${point.lon}`;
          const radius = clamp(
            3 + Math.log2(Math.max(1, point.count)) * 1.8 + (isSelected ? 2.5 : 0),
            3,
            14
          );

          const popupRows = [
            { label: "Country", value: point.country },
            { label: "Records", value: point.count.toString() },
            { label: "Ports", value: point.portSummary || "N/A" },
            { label: "Updated", value: generatedAtLabel },
          ];

          return (
            <CircleMarker
              key={pointKey}
              ref={(marker) => {
                if (marker) {
                  markerRefs.current[pointKey] = marker;
                  return;
                }
                delete markerRefs.current[pointKey];
              }}
              center={[point.lat, point.lon]}
              radius={radius}
              pathOptions={{
                color: isSelected ? "var(--map-marker-selected-stroke)" : "var(--map-marker-stroke)",
                weight: isSelected ? 2 : 1,
                fillColor: isSelected ? "var(--map-marker-selected-fill)" : "var(--map-marker-fill)",
                fillOpacity: isSelected ? 0.95 : 0.82,
              }}
            >
              <Popup className="exposure-popup" closeButton={false}>
                <div className={informationLayout.popupContainer}>
                  <div className={informationLayout.summaryRow}>
                    <span className={informationText.rowLabel}>IP</span>
                    <span className={cn(informationLayout.summaryValueWrap, informationText.rowValue)}>
                      {point.ip}
                    </span>
                  </div>
                  {popupRows.map((row) => (
                    <div key={row.label} className={informationLayout.summaryRow}>
                      <span className={informationText.rowLabel}>{row.label}</span>
                      <span className={cn(informationLayout.summaryValueWrap, informationText.rowValue)}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
