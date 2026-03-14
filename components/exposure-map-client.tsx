"use client";

import { Check, Copy } from "lucide-react";
import { divIcon, Marker as LeafletMarker } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { formatSnapshotTime } from "@/lib/datetime";
import type { ExposureSnapshot } from "@/lib/exposure-types";
import { IP_SEARCH_FOCUS_EVENT, type IpSearchPoint } from "@/lib/ip-search";
import { selectRotatingRegionPoints } from "@/lib/map-region-rotation.mjs";
import { informationLayout, informationText } from "@/lib/ui-information";
import { cn } from "@/lib/utils";

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
const SEARCH_FOCUS_ZOOM = 8;
const MAP_ROTATION_TICK_MS = 140;

type ExposureMapClientProps = {
  snapshot: ExposureSnapshot;
};

type ZoomTier = "world" | "country" | "regional" | "detail";

type PlottedPoint = {
  country: string;
  ip: string;
  isp: string | null;
  portSummary: string;
  protocolSummary: string;
  updatedAt: string | null;
  lat: number;
  lon: number;
};

type DetailRow = {
  label: string;
  value: string;
  noWrap?: boolean;
  isMaskedIp?: boolean;
};

function formatDetailValue(value: string | null) {
  return value && value.trim().length > 0 ? value : "Unknown";
}

function maskIp(value: string) {
  const ipv4Parts = value.split(".");
  if (ipv4Parts.length === 4) {
    return `${ipv4Parts[0]}.***.***.${ipv4Parts[3]}`;
  }

  const ipv6Parts = value.split(":").filter((part) => part.length > 0);
  if (ipv6Parts.length >= 4) {
    return `${ipv6Parts[0]}:${ipv6Parts[1]}:****:****:${ipv6Parts[ipv6Parts.length - 2]}:${ipv6Parts[ipv6Parts.length - 1]}`;
  }

  return value;
}

function MaskedIpValue({ value }: { value: string }) {
  const [isCopied, setIsCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setIsCopied(true);
      window.setTimeout(() => {
        setIsCopied(false);
      }, 1400);
    } catch {
      // Keep the UI quiet if clipboard permission is unavailable.
    }
  }

  return (
    <span className={cn(informationLayout.summaryValueWrap, "flex items-center justify-end gap-1.5")}>
      <span className={cn(informationText.rowValue, "whitespace-nowrap text-right")}>{maskIp(value)}</span>
      <button
        type="button"
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
        onClick={handleCopy}
        aria-label="Copy full IP address"
        title="Copy full IP address"
      >
        {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

function toDetailRows(point: PlottedPoint): DetailRow[] {
  return [
    { label: "IP", value: point.ip, noWrap: true, isMaskedIp: true },
    { label: "Country", value: formatDetailValue(point.country) },
    { label: "ISP", value: formatDetailValue(point.isp) },
    { label: "Protocol", value: formatDetailValue(point.protocolSummary) },
    { label: "Port", value: formatDetailValue(point.portSummary) },
    { label: "Updated", value: formatSnapshotTime(point.updatedAt), noWrap: true },
  ];
}

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

function MapSearchFocusController({
  onFocus,
}: {
  onFocus: (point: IpSearchPoint) => void;
}) {
  const map = useMap();

  useEffect(() => {
    function handleFocus(event: Event) {
      const customEvent = event as CustomEvent<IpSearchPoint>;
      const point = customEvent.detail;
      if (!point) {
        return;
      }

      map.flyTo([point.latitude, point.longitude], Math.max(map.getZoom(), SEARCH_FOCUS_ZOOM), {
        animate: true,
        duration: 1.1,
      });
      onFocus(point);
    }

    window.addEventListener(IP_SEARCH_FOCUS_EVENT, handleFocus as EventListener);
    return () => {
      window.removeEventListener(IP_SEARCH_FOCUS_EVENT, handleFocus as EventListener);
    };
  }, [map, onFocus]);

  return null;
}

export function ExposureMapClient({ snapshot }: ExposureMapClientProps) {
  const [rotationNowMs, setRotationNowMs] = useState(() => Date.now());
  const [mapZoom, setMapZoom] = useState(2);
  const [focusedIp, setFocusedIp] = useState<string | null>(null);
  const markerRefs = useRef(new Map<string, LeafletMarker>());
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
            isp: point.isp,
            portSummary: point.portSummary,
            protocolSummary: point.protocolSummary,
            updatedAt: point.updatedAt,
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
  const canShowPopup = !isWorldView;

  useEffect(() => {
    if (!focusedIp || isWorldView) {
      return;
    }

    const marker = markerRefs.current.get(focusedIp);
    if (!marker) {
      return;
    }

    const timerId = window.setTimeout(() => {
      marker.openPopup();
    }, 180);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [focusedIp, isWorldView, mapZoom, displayedPoints]);

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
        <MapSearchFocusController
          onFocus={(point) => {
            setFocusedIp(point.ip);
          }}
        />
        {displayedPoints.map(({ point, transition }) => (
          <Marker
            key={`${point.ip}-${point.lat}-${point.lon}-${zoomTier}-${isWorldView ? transition.phase : "all"}`}
            position={[point.lat, point.lon]}
            icon={activeIcon}
            opacity={transition.visibility}
            interactive={canShowPopup}
            keyboard={canShowPopup}
            ref={(marker) => {
              if (marker) {
                markerRefs.current.set(point.ip, marker);
              } else {
                markerRefs.current.delete(point.ip);
              }
            }}
          >
            {canShowPopup ? (
              <Popup autoPan={false} closeButton className="exposure-map-popup" minWidth={360} maxWidth={420}>
                <div className="min-w-[22rem] space-y-2">
                  <p className={cn(informationText.l3Label, "font-semibold tracking-[0.18em]")}>
                    Instance Detail
                  </p>
                  <div className={informationLayout.summaryList}>
                    {toDetailRows(point).map((row) => (
                      <div key={row.label} className={cn(informationLayout.summaryRow, "items-start")}>
                        <span className={informationText.rowLabel}>{row.label}</span>
                        {row.isMaskedIp ? (
                          <MaskedIpValue value={row.value} />
                        ) : (
                          <span
                            className={cn(
                              informationLayout.summaryValueWrap,
                              informationText.rowValue,
                              row.noWrap ? "whitespace-nowrap" : null
                            )}
                          >
                            {row.value}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Popup>
            ) : null}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
