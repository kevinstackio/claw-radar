"use client";

import type { CircleMarker as LeafletCircleMarker } from "leaflet";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { formatSnapshotTime } from "@/lib/datetime";
import type { ExposureSnapshot } from "@/lib/exposure-types";
import { IP_SEARCH_EVENT, type IpSearchResult } from "@/lib/ip-search";
import { informationLayout } from "@/lib/ui-information";
import { cn } from "@/lib/utils";

type ExposureMapClientProps = {
  snapshot: ExposureSnapshot;
};

type PlottedPoint = ExposureSnapshot["points"][number] & {
  lat: number;
  lon: number;
};

const MAP_MAX_ZOOM = 12;
const MAP_TILE_DETAIL_MAX_ZOOM = 10;
const WORLD_VIEW_MAX_ZOOM = 3;
const MARKER_RADIUS = 2.8;
const SELECTED_MARKER_RADIUS = 3.8;
const RIPPLE_PRIMARY_OFFSET = 2.1;
const RIPPLE_SECONDARY_OFFSET = 4.1;

function isValidCoordinate(lat: number, lon: number) {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={informationLayout.popupRow}>
      <span className={informationLayout.popupLabel}>{label}</span>
      <span className={informationLayout.popupValue}>{value}</span>
    </div>
  );
}

function IpPopupContent({
  point,
  updatedAtLabel,
}: {
  point: PlottedPoint;
  updatedAtLabel: string;
}) {
  const popupRows = [
    { label: "Country", value: point.country },
    ...(point.city ? [{ label: "City", value: point.city }] : []),
    ...(point.isp ? [{ label: "ISP", value: point.isp }] : []),
    ...(point.asnName || point.asnNumber
      ? [
          {
            label: "ASN",
            value:
              point.asnNumber && point.asnName
                ? `AS${point.asnNumber} ${point.asnName}`
                : point.asnNumber
                  ? `AS${point.asnNumber}`
                  : point.asnName ?? "N/A",
          },
        ]
      : []),
    ...(point.organization ? [{ label: "Organization", value: point.organization }] : []),
    { label: "Ports", value: point.portSummary || "N/A" },
    { label: "Updated", value: updatedAtLabel },
  ];

  return (
    <div className={informationLayout.popupContainer}>
      <div className="space-y-1 px-1">
        <p className={informationLayout.sectionTitle}>{point.ip}</p>
        <p className={informationLayout.sectionSubtitle}>Instance view</p>
      </div>
      {popupRows.map((row) => (
        <MetricRow key={`${point.ip}-${row.label}`} label={row.label} value={row.value} />
      ))}
    </div>
  );
}

function MapSelectionController({ target }: { target: PlottedPoint | null }) {
  const map = useMap();

  useEffect(() => {
    if (!target) {
      return;
    }

    const maxZoom = map.getMaxZoom();
    const nextZoom = Number.isFinite(maxZoom) ? maxZoom : MAP_MAX_ZOOM;
    map.flyTo([target.lat, target.lon], nextZoom, {
      duration: 0.9,
    });
  }, [map, target]);

  return null;
}

function MapZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

export function ExposureMapClient({ snapshot }: ExposureMapClientProps) {
  const [searchResult, setSearchResult] = useState<IpSearchResult | null>(null);
  const [mapZoom, setMapZoom] = useState(2);
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
          const [lon, lat] = point.value;
          if (!isValidCoordinate(lat, lon)) {
            return null;
          }

          return {
            ...point,
            lat,
            lon,
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

  const matchedPointKey = matchedPoint ? `${matchedPoint.ip}-${matchedPoint.lat}-${matchedPoint.lon}` : null;
  const updatedAtLabel = formatSnapshotTime(snapshot.generatedAt);
  const showPointPopups = mapZoom > WORLD_VIEW_MAX_ZOOM;

  const renderedPoints = useMemo(() => {
    return [...plottedPoints].sort((left, right) => {
      const leftSelected = left.ip === matchedPoint?.ip ? 1 : 0;
      const rightSelected = right.ip === matchedPoint?.ip ? 1 : 0;
      return leftSelected - rightSelected;
    });
  }, [matchedPoint?.ip, plottedPoints]);

  useEffect(() => {
    if (!matchedPointKey || !showPointPopups) {
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
  }, [matchedPointKey, showPointPopups]);

  return (
    <div className="relative size-full overflow-hidden">
      <MapContainer
        zoomControl={false}
        attributionControl={false}
        center={[20, 0]}
        zoom={2}
        minZoom={0}
        maxZoom={MAP_MAX_ZOOM}
        worldCopyJump
        className="size-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={MAP_MAX_ZOOM}
          maxNativeZoom={MAP_TILE_DETAIL_MAX_ZOOM}
        />
        <MapZoomTracker onZoomChange={setMapZoom} />
        <MapSelectionController target={matchedPoint} />

        {renderedPoints.map((point) => {
          const markerKey = `${point.ip}-${point.lat}-${point.lon}`;
          const isSelected = matchedPoint?.ip === point.ip;
          const radius = isSelected ? SELECTED_MARKER_RADIUS : MARKER_RADIUS;

          return (
            <Fragment key={markerKey}>
              <CircleMarker
                center={[point.lat, point.lon]}
                radius={radius + RIPPLE_PRIMARY_OFFSET}
                interactive={false}
                pathOptions={{
                  className: "exposure-map-ripple exposure-map-ripple--primary",
                  color: "var(--map-marker-stroke)",
                  weight: 1.2,
                  opacity: 0.58,
                  fillOpacity: 0,
                }}
              />
              <CircleMarker
                center={[point.lat, point.lon]}
                radius={radius + RIPPLE_SECONDARY_OFFSET}
                interactive={false}
                pathOptions={{
                  className: "exposure-map-ripple exposure-map-ripple--secondary",
                  color: "var(--map-marker-stroke)",
                  weight: 1,
                  opacity: 0.4,
                  fillOpacity: 0,
                }}
              />
              <CircleMarker
                ref={(marker) => {
                  if (marker) {
                    markerRefs.current[markerKey] = marker;
                    return;
                  }

                  delete markerRefs.current[markerKey];
                }}
                center={[point.lat, point.lon]}
                radius={radius}
                pathOptions={{
                  className: cn("exposure-map-marker", isSelected && "is-selected"),
                  stroke: false,
                  fillColor: isSelected ? "var(--map-marker-selected-fill)" : "var(--map-marker-fill)",
                  fillOpacity: isSelected ? 0.96 : 0.9,
                }}
              >
                {showPointPopups ? (
                  <Popup className="exposure-popup" closeButton={false}>
                    <IpPopupContent point={point} updatedAtLabel={updatedAtLabel} />
                  </Popup>
                ) : null}
              </CircleMarker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
