"use client";

import { divIcon } from "leaflet";
import { useMemo } from "react";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

import type { ExposureSnapshot } from "@/lib/exposure-types";

const MAP_MAX_ZOOM = 12;
const MAP_TILE_DETAIL_MAX_ZOOM = 10;
const LOBSTER_ICON_SIZE = 9;

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

function selectCountryRepresentativePoints(points: PlottedPoint[]) {
  const countryGroups = new Map<string, PlottedPoint[]>();

  for (const point of points) {
    // Group by the raw upstream country/region code exactly as stored.
    // Do not fold region codes like HK into CN.
    const countryKey = point.country || "Unknown";
    const existing = countryGroups.get(countryKey);
    if (existing) {
      existing.push(point);
      continue;
    }
    countryGroups.set(countryKey, [point]);
  }

  return [...countryGroups.entries()]
    .sort(([leftCountry], [rightCountry]) => leftCountry.localeCompare(rightCountry))
    .map(([, countryPoints]) => {
      const coordinateCounts = new Map<string, number>();

      for (const point of countryPoints) {
        const coordinateKey = `${point.lat},${point.lon}`;
        coordinateCounts.set(coordinateKey, (coordinateCounts.get(coordinateKey) ?? 0) + 1);
      }

      return [...countryPoints].sort((left, right) => {
        const leftCoordinateKey = `${left.lat},${left.lon}`;
        const rightCoordinateKey = `${right.lat},${right.lon}`;
        const leftCoordinateCount = coordinateCounts.get(leftCoordinateKey) ?? 0;
        const rightCoordinateCount = coordinateCounts.get(rightCoordinateKey) ?? 0;

        if (leftCoordinateCount !== rightCoordinateCount) {
          return rightCoordinateCount - leftCoordinateCount;
        }

        return left.ip.localeCompare(right.ip);
      })[0];
    });
}

export function ExposureMapClient({ snapshot }: ExposureMapClientProps) {
  const plottedPoints = useMemo(
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

      return selectCountryRepresentativePoints(allPoints);
    },
    [snapshot.points]
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
        {plottedPoints.map((point) => (
          <Marker
            key={`${point.ip}-${point.lat}-${point.lon}`}
            position={[point.lat, point.lon]}
            icon={LOBSTER_ICON}
            interactive={false}
            keyboard={false}
          />
        ))}
      </MapContainer>
    </div>
  );
}
