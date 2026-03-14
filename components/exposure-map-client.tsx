"use client";

import type { CircleMarker as LeafletCircleMarker } from "leaflet";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { formatSnapshotTime } from "@/lib/datetime";
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
};

type ClusterKind = "global" | "country" | "city";

type CountEntry = {
  label: string;
  value: number;
};

type CityAnchorCandidate = {
  label: string;
  ipCount: number;
};

type AggregateBucket = {
  key: string;
  kind: ClusterKind;
  label: string;
  country: string | null;
  city: string | null;
  latWeighted: number;
  lonWeighted: number;
  weightTotal: number;
  cityAnchorCandidates: Map<string, CityAnchorCandidate>;
  anchorCityKey: string | null;
  anchorLat: number | null;
  anchorLon: number | null;
  anchorIp: string | null;
  ipCount: number;
  countries: Map<string, number>;
  cities: Map<string, number>;
  ports: Map<string, number>;
  organizations: Map<string, number>;
};

type ClusterNode = {
  key: string;
  kind: ClusterKind;
  label: string;
  country: string | null;
  city: string | null;
  lat: number;
  lon: number;
  ipCount: number;
  countryCount: number;
  cityCount: number;
  topCountries: CountEntry[];
  topCities: CountEntry[];
  topPorts: CountEntry[];
  topOrganizations: CountEntry[];
};

type IpNode = {
  key: string;
  kind: "ip";
  point: PlottedPoint;
};

type MapNode = ClusterNode | IpNode;

type ClusterVisualSpec = {
  markerRadius: number;
  fillOpacity: number;
  ripplePrimaryOffset: number;
  rippleSecondaryOffset: number;
  ripplePrimaryWeight: number;
  rippleSecondaryWeight: number;
  ripplePrimaryOpacity: number;
  rippleSecondaryOpacity: number;
};

const MAP_LAYER_ZOOM_RANGES = {
  global: { min: 0, max: 3 },
  country: { min: 4, max: 6 },
  city: { min: 7, max: 9 },
  ip: { min: 10, max: 12 },
} as const;

const MAP_MAX_ZOOM = MAP_LAYER_ZOOM_RANGES.ip.max;
const MAP_TILE_DETAIL_MAX_ZOOM = 10;
const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const CLUSTER_VISUAL_SPECS: Record<ClusterKind, ClusterVisualSpec> = {
  // Frozen baseline for the world view. Keep this unchanged unless we explicitly revisit the global layer.
  global: {
    markerRadius: 4.1,
    fillOpacity: 0.68,
    ripplePrimaryOffset: 2.1,
    rippleSecondaryOffset: 4.1,
    ripplePrimaryWeight: 1.2,
    rippleSecondaryWeight: 1,
    ripplePrimaryOpacity: 0.58,
    rippleSecondaryOpacity: 0.4,
  },
  country: {
    markerRadius: 4.7,
    fillOpacity: 0.76,
    ripplePrimaryOffset: 1.9,
    rippleSecondaryOffset: 3.7,
    ripplePrimaryWeight: 1.1,
    rippleSecondaryWeight: 0.9,
    ripplePrimaryOpacity: 0.58,
    rippleSecondaryOpacity: 0.4,
  },
  city: {
    markerRadius: 5.1,
    fillOpacity: 0.82,
    ripplePrimaryOffset: 1.9,
    rippleSecondaryOffset: 3.7,
    ripplePrimaryWeight: 1.1,
    rippleSecondaryWeight: 0.9,
    ripplePrimaryOpacity: 0.58,
    rippleSecondaryOpacity: 0.4,
  },
};

function isValidCoordinate(lat: number, lon: number) {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function roundForGrid(value: number, step: number) {
  return Math.floor(value / step) * step;
}

function normalizeCityName(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function getCityAnchorLabel(value: string | null | undefined) {
  return normalizeCityName(value) ?? "Unknown";
}

function getCityAnchorKey(value: string | null | undefined) {
  return getCityAnchorLabel(value).toLowerCase();
}

function addCount(map: Map<string, number>, key: string | null | undefined, value: number) {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) {
    return;
  }
  map.set(normalizedKey, (map.get(normalizedKey) ?? 0) + value);
}

function collectPorts(portSummary: string, weight: number, map: Map<string, number>) {
  portSummary
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((port) => addCount(map, port, weight));
}

function toTopEntries(map: Map<string, number>, limit = 3): CountEntry[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function formatCompactNumber(value: number) {
  return compactNumberFormatter.format(value);
}

function createBucket(
  key: string,
  kind: ClusterKind,
  label: string,
  options?: { country?: string | null; city?: string | null }
): AggregateBucket {
  return {
    key,
    kind,
    label,
    country: options?.country ?? null,
    city: options?.city ?? null,
    latWeighted: 0,
    lonWeighted: 0,
    weightTotal: 0,
    cityAnchorCandidates: new Map(),
    anchorCityKey: null,
    anchorLat: null,
    anchorLon: null,
    anchorIp: null,
    ipCount: 0,
    countries: new Map(),
    cities: new Map(),
    ports: new Map(),
    organizations: new Map(),
  };
}

function accumulateBucket(bucket: AggregateBucket, point: PlottedPoint) {
  const weight = Math.max(point.ipCount, 1);
  bucket.latWeighted += point.lat * weight;
  bucket.lonWeighted += point.lon * weight;
  bucket.weightTotal += weight;
  bucket.ipCount += point.ipCount;

  addCount(bucket.countries, point.country, point.ipCount);
  addCount(bucket.cities, normalizeCityName(point.city), point.ipCount);
  collectPorts(point.portSummary, point.ipCount, bucket.ports);

  if (bucket.kind === "global") {
    const cityKey = getCityAnchorKey(point.city);
    const cityCandidate = bucket.cityAnchorCandidates.get(cityKey) ?? {
      label: getCityAnchorLabel(point.city),
      ipCount: 0,
    };
    cityCandidate.ipCount += point.ipCount;
    bucket.cityAnchorCandidates.set(cityKey, cityCandidate);
  }

  const organizationLabel =
    point.organization ??
    point.isp ??
    (point.asnName && point.asnNumber
      ? `AS${point.asnNumber} ${point.asnName}`
      : point.asnName
        ? point.asnName
        : point.asnNumber
          ? `AS${point.asnNumber}`
          : null);
  addCount(bucket.organizations, organizationLabel, point.ipCount);
}

function selectGlobalAnchorCities(buckets: Map<string, AggregateBucket>) {
  for (const bucket of buckets.values()) {
    const selected = [...bucket.cityAnchorCandidates.entries()].sort((a, b) => {
      if (b[1].ipCount !== a[1].ipCount) {
        return b[1].ipCount - a[1].ipCount;
      }

      return a[1].label.localeCompare(b[1].label);
    })[0];

    if (!selected) {
      continue;
    }

    bucket.anchorCityKey = selected[0];
    bucket.city = selected[1].label;
  }
}

function attachGlobalAnchors(buckets: Map<string, AggregateBucket>, points: PlottedPoint[]) {
  for (const point of points) {
    const country = point.country || "Unknown";
    const bucket = buckets.get(`global-country:${country}`);
    if (!bucket || bucket.anchorCityKey === null || getCityAnchorKey(point.city) !== bucket.anchorCityKey) {
      continue;
    }

    if (bucket.anchorIp === null || point.ip.localeCompare(bucket.anchorIp) < 0) {
      bucket.anchorLat = point.lat;
      bucket.anchorLon = point.lon;
      bucket.anchorIp = point.ip;
    }
  }
}

function finalizeBuckets(buckets: Map<string, AggregateBucket>): ClusterNode[] {
  return [...buckets.values()]
    .map((bucket) => ({
      key: bucket.key,
      kind: bucket.kind,
      label: bucket.label,
      country: bucket.country,
      city: bucket.city,
      lat:
        bucket.kind === "global" && bucket.anchorLat !== null
          ? bucket.anchorLat
          : bucket.weightTotal > 0
            ? bucket.latWeighted / bucket.weightTotal
            : 0,
      lon:
        bucket.kind === "global" && bucket.anchorLon !== null
          ? bucket.anchorLon
          : bucket.weightTotal > 0
            ? bucket.lonWeighted / bucket.weightTotal
            : 0,
      ipCount: bucket.ipCount,
      countryCount: bucket.countries.size,
      cityCount: bucket.cities.size,
      topCountries: toTopEntries(bucket.countries),
      topCities: toTopEntries(bucket.cities),
      topPorts: toTopEntries(bucket.ports),
      topOrganizations: toTopEntries(bucket.organizations),
    }))
    .sort((a, b) => b.ipCount - a.ipCount);
}

function cityGridStepForZoom(zoom: number) {
  if (zoom <= 7) return 1.8;
  if (zoom === 8) return 1.1;
  return 0.65;
}

function buildGlobalNodes(points: PlottedPoint[]): ClusterNode[] {
  const buckets = new Map<string, AggregateBucket>();

  for (const point of points) {
    const country = point.country || "Unknown";
    const key = `global-country:${country}`;
    const bucket =
      buckets.get(key) ??
      createBucket(key, "global", country, {
        country,
      });

    accumulateBucket(bucket, point);
    buckets.set(key, bucket);
  }

  selectGlobalAnchorCities(buckets);
  attachGlobalAnchors(buckets, points);

  return finalizeBuckets(buckets);
}

function buildCountryNodes(points: PlottedPoint[]): ClusterNode[] {
  const buckets = new Map<string, AggregateBucket>();

  for (const point of points) {
    const country = point.country || "Unknown";
    const key = `country:${country}`;
    const bucket =
      buckets.get(key) ??
      createBucket(key, "country", country, {
        country,
      });

    accumulateBucket(bucket, point);
    buckets.set(key, bucket);
  }

  return finalizeBuckets(buckets);
}

function buildCityNodes(points: PlottedPoint[], zoom: number): ClusterNode[] {
  const coordStep = cityGridStepForZoom(zoom);
  const buckets = new Map<string, AggregateBucket>();

  for (const point of points) {
    const country = point.country || "Unknown";
    const city = normalizeCityName(point.city);
    const key = city
      ? `city:${country}:${city.toLowerCase()}`
      : `city-grid:${country}:${roundForGrid(point.lat + 90, coordStep)}:${roundForGrid(point.lon + 180, coordStep)}`;
    const label = city ?? `${country} Area`;
    const bucket =
      buckets.get(key) ??
      createBucket(key, "city", label, {
        country,
        city,
      });

    accumulateBucket(bucket, point);
    buckets.set(key, bucket);
  }

  return finalizeBuckets(buckets);
}

function buildIpNodes(points: PlottedPoint[]): IpNode[] {
  return points.map((point) => ({
    key: `${point.ip}-${point.lat}-${point.lon}`,
    kind: "ip",
    point,
  }));
}

function getClusterMarkerRadius(node: ClusterNode) {
  return CLUSTER_VISUAL_SPECS[node.kind].markerRadius;
}

function getClusterMarkerStyle(node: ClusterNode) {
  return {
    stroke: "var(--map-marker-stroke)",
    fill: "var(--map-marker-fill)",
    fillOpacity: CLUSTER_VISUAL_SPECS[node.kind].fillOpacity,
  };
}

function getClusterRippleRadius(node: ClusterNode, ring: 1 | 2) {
  const baseRadius = getClusterMarkerRadius(node);
  const layerSpec = CLUSTER_VISUAL_SPECS[node.kind];
  const offset = ring === 1 ? layerSpec.ripplePrimaryOffset : layerSpec.rippleSecondaryOffset;
  return baseRadius + offset;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={informationLayout.popupRow}>
      <span className={informationLayout.popupLabel}>{label}</span>
      <span className={informationLayout.popupValue}>{value}</span>
    </div>
  );
}

function PopupTopList({ title, items }: { title: string; items: CountEntry[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className={informationText.l3Label}>{title}</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className={informationLayout.popupRow}>
            <span className={informationLayout.popupLabel}>{item.label}</span>
            <span className={informationLayout.popupValue}>{formatCompactNumber(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClusterPopupContent({
  node,
  updatedAtLabel,
}: {
  node: ClusterNode;
  updatedAtLabel: string;
}) {
  const title =
    node.kind === "global"
      ? node.country ?? node.label
      : node.kind === "country"
        ? node.country ?? node.label
        : node.city ?? node.label;
  const subtitle =
    node.kind === "global"
      ? `Zoom ${MAP_LAYER_ZOOM_RANGES.global.min}-${MAP_LAYER_ZOOM_RANGES.global.max} hotspot anchor`
      : node.kind === "country"
        ? "Country / region aggregate"
        : node.country
          ? `${node.country} city aggregate`
          : "City aggregate";

  const rows =
    node.kind === "global"
      ? [
          { label: "Country", value: node.country ?? "Unknown" },
          { label: "Anchor City", value: node.city ?? "Unknown" },
          { label: "Cities", value: node.cityCount.toString() },
          { label: "IPs", value: node.ipCount.toLocaleString("en-US") },
          { label: "Updated", value: updatedAtLabel },
        ]
      : node.kind === "country"
        ? [
            { label: "Country", value: node.country ?? "Unknown" },
            { label: "Cities", value: node.cityCount.toString() },
            { label: "IPs", value: node.ipCount.toLocaleString("en-US") },
            { label: "Updated", value: updatedAtLabel },
          ]
        : [
            { label: "City", value: node.city ?? node.label },
            { label: "Country", value: node.country ?? "Unknown" },
            { label: "IPs", value: node.ipCount.toLocaleString("en-US") },
            { label: "Updated", value: updatedAtLabel },
          ];

  return (
    <div className={informationLayout.popupContainer}>
      <div className="space-y-1 px-1">
        <p className={informationLayout.sectionTitle}>{title}</p>
        <p className={informationLayout.sectionSubtitle}>{subtitle}</p>
      </div>
      <div className="space-y-1.5">
        {rows.map((row) => (
          <MetricRow key={`${node.key}-${row.label}`} label={row.label} value={row.value} />
        ))}
      </div>
      <PopupTopList
        title={
          node.kind === "global" ? "Top Cities" : node.kind === "country" ? "Top Cities" : "Top Organizations"
        }
        items={
          node.kind === "global"
            ? node.topCities
            : node.kind === "country"
              ? node.topCities
              : node.topOrganizations
        }
      />
      <PopupTopList title="Top Ports" items={node.topPorts} />
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
        <p className={informationLayout.sectionSubtitle}>Single IP view</p>
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

  const matchedPointKey = matchedPoint
    ? `${matchedPoint.ip}-${matchedPoint.lat}-${matchedPoint.lon}`
    : null;

  const updatedAtLabel = formatSnapshotTime(snapshot.generatedAt);

  const mapNodes = useMemo<MapNode[]>(() => {
    if (mapZoom >= MAP_LAYER_ZOOM_RANGES.ip.min) {
      return buildIpNodes(plottedPoints);
    }

    if (mapZoom >= MAP_LAYER_ZOOM_RANGES.city.min) {
      return buildCityNodes(plottedPoints, mapZoom);
    }

    if (mapZoom >= MAP_LAYER_ZOOM_RANGES.country.min) {
      return buildCountryNodes(plottedPoints);
    }

    return buildGlobalNodes(plottedPoints);
  }, [mapZoom, plottedPoints]);

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

        {mapNodes.map((node) => {
          if (node.kind === "ip") {
            const point = node.point;
            const isSelected = matchedPoint?.ip === point.ip;
            const radius = isSelected ? 3.8 : 2.8;

            return (
              <CircleMarker
                key={node.key}
                ref={(marker) => {
                  if (marker) {
                    markerRefs.current[node.key] = marker;
                    return;
                  }
                  delete markerRefs.current[node.key];
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
                <Popup className="exposure-popup" closeButton={false}>
                  <IpPopupContent point={point} updatedAtLabel={updatedAtLabel} />
                </Popup>
              </CircleMarker>
            );
          }

          const markerStyle = getClusterMarkerStyle(node);

          const clusterRadius = getClusterMarkerRadius(node);

          return (
            <Fragment key={node.key}>
              <CircleMarker
                center={[node.lat, node.lon]}
                radius={getClusterRippleRadius(node, 1)}
                interactive={false}
                pathOptions={{
                  className: "exposure-map-ripple exposure-map-ripple--primary",
                  color: markerStyle.stroke,
                  weight: CLUSTER_VISUAL_SPECS[node.kind].ripplePrimaryWeight,
                  opacity: CLUSTER_VISUAL_SPECS[node.kind].ripplePrimaryOpacity,
                  fillOpacity: 0,
                }}
              />
              <CircleMarker
                center={[node.lat, node.lon]}
                radius={getClusterRippleRadius(node, 2)}
                interactive={false}
                pathOptions={{
                  className: "exposure-map-ripple exposure-map-ripple--secondary",
                  color: markerStyle.stroke,
                  weight: CLUSTER_VISUAL_SPECS[node.kind].rippleSecondaryWeight,
                  opacity: CLUSTER_VISUAL_SPECS[node.kind].rippleSecondaryOpacity,
                  fillOpacity: 0,
                }}
              />
              <CircleMarker
                center={[node.lat, node.lon]}
                radius={clusterRadius}
                pathOptions={{
                  className: "exposure-map-marker exposure-map-cluster",
                  stroke: false,
                  fillColor: markerStyle.fill,
                  fillOpacity: markerStyle.fillOpacity,
                }}
              >
                <Popup className="exposure-popup" closeButton={false}>
                  <ClusterPopupContent node={node} updatedAtLabel={updatedAtLabel} />
                </Popup>
              </CircleMarker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
