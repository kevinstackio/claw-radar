import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { CountryExposure, ExposurePoint, ExposureSnapshot } from "@/lib/exposure-types";

type BackupPayload = {
  meta?: { generatedAt?: string };
  hits?: unknown[];
};

type MutablePoint = {
  ip: string;
  country: string;
  latitude: number;
  longitude: number;
  count: number;
  ports: Set<number>;
};

const BACKUP_DIR = path.join(process.cwd(), "data", "backups", "exposure");

const LATITUDE_PATHS = [
  ["location", "coordinates", "latitude"],
  ["location", "coordinates", "lat"],
  ["location", "latitude"],
  ["geo", "location", "lat"],
  ["geo", "latitude"],
  ["services", "0", "location", "coordinates", "latitude"],
];

const LONGITUDE_PATHS = [
  ["location", "coordinates", "longitude"],
  ["location", "coordinates", "lon"],
  ["location", "longitude"],
  ["geo", "location", "lon"],
  ["geo", "longitude"],
  ["services", "0", "location", "coordinates", "longitude"],
];

const COUNTRY_PATHS = [
  ["location", "country"],
  ["location", "country_name"],
  ["geo", "country"],
  ["autonomous_system", "country"],
];

const IP_PATHS = [
  ["ip"],
  ["ip_address"],
  ["host", "ip"],
  ["asset", "ip"],
  ["name"],
];

const PORT_PATHS = [
  ["port"],
  ["services", "0", "port"],
  ["service", "port"],
  ["transport", "port"],
];

function getValueByPath(value: unknown, pathTokens: string[]): unknown {
  let current: unknown = value;

  for (const token of pathTokens) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number.parseInt(token, 10);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[token];
      continue;
    }
    return undefined;
  }

  return current;
}

function pickFirstNumber(value: unknown, paths: string[][]): number | null {
  for (const pathTokens of paths) {
    const raw = getValueByPath(value, pathTokens);
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === "string" && raw.trim()) {
      const parsed = Number.parseFloat(raw.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function pickFirstString(value: unknown, paths: string[][]): string {
  for (const pathTokens of paths) {
    const raw = getValueByPath(value, pathTokens);
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }
  return "";
}

function normalizeIp(raw: string): string {
  return raw.trim().replace(/^\[|\]$/g, "");
}

function isPublicIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  const nums = parts.map((part) => Number.parseInt(part, 10));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) {
    return false;
  }

  const [a, b] = nums;
  if (a === 10) return false;
  if (a === 127) return false;
  if (a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a >= 224) return false;

  return true;
}

function isPublicIPv6(ip: string): boolean {
  const value = ip.toLowerCase();
  if (value === "::1") return false;
  if (value.startsWith("fc") || value.startsWith("fd")) return false;
  if (value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) {
    return false;
  }
  return true;
}

function isPublicIp(ip: string): boolean {
  const value = normalizeIp(ip);
  if (value.includes(".")) {
    return isPublicIPv4(value);
  }
  if (value.includes(":")) {
    return isPublicIPv6(value);
  }
  return false;
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

async function resolveLatestBackupFile(): Promise<string | null> {
  const latestPointer = path.join(BACKUP_DIR, "latest.json");

  try {
    const pointerRaw = await readFile(latestPointer, "utf-8");
    const pointer = JSON.parse(pointerRaw) as { latestBackup?: string };
    if (pointer.latestBackup && typeof pointer.latestBackup === "string") {
      const fromPointer = path.join(process.cwd(), pointer.latestBackup);
      return fromPointer;
    }
  } catch {
    // Fall through to directory scan.
  }

  try {
    const entries = await readdir(BACKUP_DIR, { withFileTypes: true });
    const dayDirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();

    for (const day of dayDirs) {
      const dayPath = path.join(BACKUP_DIR, day);
      const files = (await readdir(dayPath))
        .filter((entry) => entry.endsWith(".json"))
        .sort()
        .reverse();
      if (files.length > 0) {
        return path.join(dayPath, files[0]);
      }
    }
  } catch {
    return null;
  }

  return null;
}

function toCountrySeries(countryCounts: Map<string, number>): CountryExposure[] {
  return [...countryCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function toPoints(pointMap: Map<string, MutablePoint>): ExposurePoint[] {
  return [...pointMap.values()].map((point) => ({
    name: point.country || point.ip,
    ip: point.ip,
    country: point.country || "Unknown",
    portSummary: [...point.ports].sort((a, b) => a - b).join(", "),
    count: point.count,
    value: [point.longitude, point.latitude, point.count],
  }));
}

export async function loadLatestExposureSnapshot(): Promise<ExposureSnapshot> {
  const latestFile = await resolveLatestBackupFile();

  if (!latestFile) {
    return {
      generatedAt: null,
      sourceFile: null,
      totalRecords: 0,
      publicRecords: 0,
      plottedPoints: 0,
      countries: [],
      points: [],
      note: "No local backup found. Run `pnpm netlas:fetch` after configuring `.env.local`.",
    };
  }

  try {
    const raw = await readFile(latestFile, "utf-8");
    const payload = JSON.parse(raw) as BackupPayload;
    const hits = Array.isArray(payload.hits) ? payload.hits : [];

    const pointMap = new Map<string, MutablePoint>();
    const countryCounts = new Map<string, number>();
    let publicRecords = 0;

    for (const hit of hits) {
      const ip = normalizeIp(pickFirstString(hit, IP_PATHS));
      if (!ip || !isPublicIp(ip)) {
        continue;
      }

      publicRecords += 1;

      const country = pickFirstString(hit, COUNTRY_PATHS) || "Unknown";
      countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);

      const latitude = pickFirstNumber(hit, LATITUDE_PATHS);
      const longitude = pickFirstNumber(hit, LONGITUDE_PATHS);

      if (latitude === null || longitude === null || !isValidCoordinate(latitude, longitude)) {
        continue;
      }

      const portRaw = pickFirstNumber(hit, PORT_PATHS);
      const port =
        typeof portRaw === "number" && Number.isInteger(portRaw) && portRaw > 0 && portRaw <= 65535
          ? portRaw
          : null;
      const key = `${ip}|${latitude.toFixed(4)}|${longitude.toFixed(4)}`;
      const existing = pointMap.get(key);

      if (existing) {
        existing.count += 1;
        if (port !== null) {
          existing.ports.add(port);
        }
      } else {
        pointMap.set(key, {
          ip,
          country,
          latitude,
          longitude,
          count: 1,
          ports: port !== null ? new Set([port]) : new Set<number>(),
        });
      }
    }

    const points = toPoints(pointMap);
    const countries = toCountrySeries(countryCounts);

    return {
      generatedAt: payload.meta?.generatedAt ?? null,
      sourceFile: latestFile,
      totalRecords: hits.length,
      publicRecords,
      plottedPoints: points.length,
      countries,
      points,
      note: null,
    };
  } catch {
    return {
      generatedAt: null,
      sourceFile: latestFile,
      totalRecords: 0,
      publicRecords: 0,
      plottedPoints: 0,
      countries: [],
      points: [],
      note: "Latest backup exists but cannot be parsed. Re-run `pnpm netlas:fetch` to regenerate it.",
    };
  }
}
