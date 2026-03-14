"use client";

import { divIcon } from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

import type { ExposureSnapshot } from "@/lib/exposure-types";
import { selectRotatingRegionPoints } from "@/lib/map-region-rotation.mjs";

const MAP_MAX_ZOOM = 12;
const MAP_TILE_DETAIL_MAX_ZOOM = 10;
const LOBSTER_ICON_SIZE = 9;
const MAP_ROTATION_TICK_MS = 140;

type ExposureMapClientProps = {
  snapshot: ExposureSnapshot;
};

type PlottedPoint = {
  country: string;
  ip: string;
  lat: number;
  lon: number;
};

const LOBSTER_ICON = divIcon({
  className: "exposure-map-lobster-icon",
  html: '<span class="exposure-map-lobster-glyph">🦞</span>',
  iconAnchor: [LOBSTER_ICON_SIZE / 2, LOBSTER_ICON_SIZE / 2],
  iconSize: [LOBSTER_ICON_SIZE, LOBSTER_ICON_SIZE],
});

function isValidCoordinate(lat: number, lon: number) {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function ExposureMapClient({ snapshot }: ExposureMapClientProps) {
  const [rotationNowMs, setRotationNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRotationNowMs(Date.now());
    }, MAP_ROTATION_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const rotatingPoints = useMemo(
    () => {
      const allPoints = snapshot.points
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

      return selectRotatingRegionPoints(allPoints, rotationNowMs);
    },
    [rotationNowMs, snapshot.points]
  );

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
        {rotatingPoints.map(({ point, transition }) => (
          <Marker
            key={`${point.ip}-${point.lat}-${point.lon}`}
            position={[point.lat, point.lon]}
            icon={LOBSTER_ICON}
            opacity={transition.visibility}
            interactive={false}
            keyboard={false}
          />
        ))}
      </MapContainer>
    </div>
  );
}
