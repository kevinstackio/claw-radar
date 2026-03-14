"use client";

import { divIcon } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

import type { ExposureSnapshot } from "@/lib/exposure-types";
import { selectRotatingRegionPoints } from "@/lib/map-region-rotation.mjs";

const MAP_MAX_ZOOM = 12;
const MAP_TILE_DETAIL_MAX_ZOOM = 10;
const MAP_MIN_ZOOM = 1;
const WORLD_VIEW_MAX_ZOOM = 3;
const COUNTRY_VIEW_MAX_ZOOM = 6;
const REGIONAL_VIEW_MAX_ZOOM = 9;
const WORLD_LOBSTER_ICON_SIZE = 12;
const COUNTRY_LOBSTER_ICON_SIZE = 16;
const REGIONAL_LOBSTER_ICON_SIZE = 16;
const DETAIL_LOBSTER_ICON_SIZE = 16;
const MAP_ROTATION_TICK_MS = 140;

type ExposureMapClientProps = {
  snapshot: ExposureSnapshot;
};

type ZoomTier = "world" | "country" | "regional" | "detail";

type PlottedPoint = {
  country: string;
  ip: string;
  lat: number;
  lon: number;
};

function createLobsterIcon({ className, size }: { className?: string; size: number }) {
  return divIcon({
    className: className ? `exposure-map-lobster-icon ${className}` : "exposure-map-lobster-icon",
    html: `<span class="exposure-map-lobster-glyph" style="font-size:${size}px">🦞</span>`,
    iconAnchor: [size / 2, size / 2],
    iconSize: [size, size],
  });
}

const WORLD_LOBSTER_ICON = createLobsterIcon({
  size: WORLD_LOBSTER_ICON_SIZE,
});

const COUNTRY_LOBSTER_ICON = createLobsterIcon({
  className: "is-country",
  size: COUNTRY_LOBSTER_ICON_SIZE,
});

const REGIONAL_LOBSTER_ICON = createLobsterIcon({
  className: "is-regional",
  size: REGIONAL_LOBSTER_ICON_SIZE,
});

const DETAIL_LOBSTER_ICON = createLobsterIcon({
  className: "is-detail",
  size: DETAIL_LOBSTER_ICON_SIZE,
});

function isValidCoordinate(lat: number, lon: number) {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function resolveZoomTier(zoom: number): ZoomTier {
  if (zoom <= WORLD_VIEW_MAX_ZOOM) {
    return "world";
  }

  if (zoom <= COUNTRY_VIEW_MAX_ZOOM) {
    return "country";
  }

  if (zoom <= REGIONAL_VIEW_MAX_ZOOM) {
    return "regional";
  }

  return "detail";
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
  const [rotationNowMs, setRotationNowMs] = useState(() => Date.now());
  const [mapZoom, setMapZoom] = useState(2);
  const zoomTier = resolveZoomTier(mapZoom);
  const isWorldView = zoomTier === "world";

  useEffect(() => {
    if (!isWorldView) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRotationNowMs(Date.now());
    }, MAP_ROTATION_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isWorldView]);

  const allPoints = useMemo(
    () => {
      return snapshot.points
        .map((point) => {
          const [lon, lat] = point.value;
          if (!isValidCoordinate(lat, lon)) {
            return null;
          }

          return {
            country: point.country || "Unknown",
            ip: point.ip,
            lat,
            lon,
          };
        })
        .filter((point): point is PlottedPoint => point !== null);
    },
    [snapshot.points]
  );

  const displayedPoints = useMemo(
    () => (isWorldView ? selectRotatingRegionPoints(allPoints, rotationNowMs) : allPoints.map((point) => ({
      point,
      transition: {
        phase: "steady",
        visibility: 1,
      },
    }))),
    [allPoints, isWorldView, rotationNowMs]
  );

  const activeIcon =
    zoomTier === "world"
      ? WORLD_LOBSTER_ICON
      : zoomTier === "country"
      ? COUNTRY_LOBSTER_ICON
      : zoomTier === "regional"
      ? REGIONAL_LOBSTER_ICON
      : DETAIL_LOBSTER_ICON;

  return (
    <div className="relative size-full overflow-hidden">
      <MapContainer
        zoomControl={false}
        attributionControl={false}
        center={[20, 0]}
        zoom={2}
        minZoom={MAP_MIN_ZOOM}
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
        {displayedPoints.map(({ point, transition }) => (
          <Marker
            key={`${point.ip}-${point.lat}-${point.lon}-${zoomTier}-${isWorldView ? transition.phase : "all"}`}
            position={[point.lat, point.lon]}
            icon={activeIcon}
            opacity={transition.visibility}
            interactive={false}
            keyboard={false}
          />
        ))}
      </MapContainer>
    </div>
  );
}
