import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

import type { CountryExposure, ExposurePoint, ExposureSnapshot } from "@/lib/exposure-types";

type BackupPayload = {
  meta?: { generatedAt?: string };
  hits?: unknown[];
};

type RuntimeDataSource = "auto" | "local" | "database";

type MutablePoint = {
  ip: string;
  country: string;
  latitude: number;
  longitude: number;
  count: number;
  ports: Set<number>;
};

type DatabasePointRow = {
  ip: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  hit_count: number | string | null;
  ports: unknown;
  last_seen_at: string | Date | null;
};

const BACKUP_DIR = path.join(process.cwd(), "data", "backups", "exposure");
const DATABASE_SOURCE_FILE = "database:netlas_hits";
const DEFAULT_DATA_SOURCE: RuntimeDataSource = "auto";

const globalForPg = globalThis as typeof globalThis & {
  __clawRadarPool?: Pool;
};

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

const IP_PATHS = [["ip"], ["ip_address"], ["host", "ip"], ["asset", "ip"], ["name"]];

const PORT_PATHS = [["port"], ["services", "0", "port"], ["service", "port"], ["transport", "port"]];

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

function parseDataSource(value: string | undefined): RuntimeDataSource {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "database") return "database";
  if (normalized === "local") return "local";
  return DEFAULT_DATA_SOURCE;
}

function getDataSourcePriority(): Array<Exclude<RuntimeDataSource, "auto">> {
  const configured = parseDataSource(process.env.EXPOSURE_DATA_SOURCE);
  if (configured === "database") return ["database"];
  if (configured === "local") return ["local"];
  if (process.env.NODE_ENV === "production") {
    return ["database", "local"];
  }
  return ["local", "database"];
}

function shouldUseTls(connectionString: string) {
  return /sslmode=require/i.test(connectionString);
}

function getDatabasePool() {
  const connectionString = String(process.env.DATABASE_URL ?? "").trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!globalForPg.__clawRadarPool) {
    globalForPg.__clawRadarPool = new Pool({
      connectionString,
      ssl: shouldUseTls(connectionString) ? { rejectUnauthorized: false } : undefined,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return globalForPg.__clawRadarPool;
}

function normalizePortList(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number.parseInt(String(item), 10))
      .filter((item) => Number.isInteger(item) && item > 0 && item <= 65535)
      .sort((a, b) => a - b);
  }

  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return normalizePortList(value.slice(1, -1).split(","));
  }

  return [];
}

async function resolveLatestBackupFile(): Promise<string | null> {
  const latestPointer = path.join(BACKUP_DIR, "latest.json");

  try {
    const pointerRaw = await readFile(latestPointer, "utf-8");
    const pointer = JSON.parse(pointerRaw) as { latestBackup?: string };
    if (pointer.latestBackup && typeof pointer.latestBackup === "string") {
      const normalizedBackupPath = pointer.latestBackup.replace(/[\\/]+/g, path.sep);
      const fromPointer = path.isAbsolute(normalizedBackupPath)
        ? normalizedBackupPath
        : path.join(process.cwd(), normalizedBackupPath);
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
  return [...countryCounts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
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

async function loadLatestExposureSnapshotFromLocal(): Promise<ExposureSnapshot> {
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

async function loadLatestExposureSnapshotFromDatabase(): Promise<ExposureSnapshot> {
  const pool = getDatabasePool();
  let usedLegacyAggregation = false;
  let result;

  try {
    result = await pool.query<DatabasePointRow>(`
      select
        host(ip) as ip,
        coalesce(nullif(country, ''), 'Unknown') as country,
        latitude,
        longitude,
        sum(greatest(seen_count, 1))::int as hit_count,
        array_remove(array_agg(distinct port order by port), null) as ports,
        max(last_seen_at) as last_seen_at
      from netlas_hits
      where ip is not null
        and latitude is not null
        and longitude is not null
      group by host(ip), coalesce(nullif(country, ''), 'Unknown'), latitude, longitude
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isSchemaDrift =
      /column "seen_count" does not exist/i.test(message) ||
      /column "last_seen_at" does not exist/i.test(message);

    if (!isSchemaDrift) {
      throw error;
    }

    usedLegacyAggregation = true;
    result = await pool.query<DatabasePointRow>(`
      select
        host(ip) as ip,
        coalesce(nullif(country, ''), 'Unknown') as country,
        latitude,
        longitude,
        count(*)::int as hit_count,
        array_remove(array_agg(distinct port order by port), null) as ports,
        null::timestamptz as last_seen_at
      from netlas_hits
      where ip is not null
        and latitude is not null
        and longitude is not null
      group by host(ip), coalesce(nullif(country, ''), 'Unknown'), latitude, longitude
    `);
  }

  const compatibilityNote = usedLegacyAggregation
    ? "Database schema is outdated (missing `seen_count` or `last_seen_at`). Compatibility mode is active; run `pnpm netlas:validate` to migrate schema."
    : null;

  if (result.rowCount === 0) {
    return {
      generatedAt: null,
      sourceFile: DATABASE_SOURCE_FILE,
      totalRecords: 0,
      publicRecords: 0,
      plottedPoints: 0,
      countries: [],
      points: [],
      note: compatibilityNote
        ? `No records found in database table \`netlas_hits\`. Run the Netlas sync job first. ${compatibilityNote}`
        : "No records found in database table `netlas_hits`. Run the Netlas sync job first.",
    };
  }

  const pointMap = new Map<string, MutablePoint>();
  const countryCounts = new Map<string, number>();
  let publicRecords = 0;
  let generatedAtEpochMs = 0;

  for (const row of result.rows) {
    const ip = normalizeIp(String(row.ip ?? ""));
    if (!ip || !isPublicIp(ip)) {
      continue;
    }

    const latitude = typeof row.latitude === "number" ? row.latitude : null;
    const longitude = typeof row.longitude === "number" ? row.longitude : null;
    if (latitude === null || longitude === null || !isValidCoordinate(latitude, longitude)) {
      continue;
    }

    const countRaw = Number.parseInt(String(row.hit_count ?? "1"), 10);
    const count = Number.isInteger(countRaw) && countRaw > 0 ? countRaw : 1;
    const country = String(row.country ?? "Unknown").trim() || "Unknown";
    const ports = normalizePortList(row.ports);

    publicRecords += count;
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + count);

    const key = `${ip}|${latitude.toFixed(4)}|${longitude.toFixed(4)}`;
    const existing = pointMap.get(key);
    if (existing) {
      existing.count += count;
      for (const port of ports) {
        existing.ports.add(port);
      }
    } else {
      pointMap.set(key, {
        ip,
        country,
        latitude,
        longitude,
        count,
        ports: new Set(ports),
      });
    }

    if (row.last_seen_at) {
      const epochMs = new Date(row.last_seen_at).getTime();
      if (Number.isFinite(epochMs) && epochMs > generatedAtEpochMs) {
        generatedAtEpochMs = epochMs;
      }
    }
  }

  const points = toPoints(pointMap);
  const countries = toCountrySeries(countryCounts);

  return {
    generatedAt: generatedAtEpochMs > 0 ? new Date(generatedAtEpochMs).toISOString() : null,
    sourceFile: DATABASE_SOURCE_FILE,
    totalRecords: publicRecords,
    publicRecords,
    plottedPoints: points.length,
    countries,
    points,
    note:
      compatibilityNote && points.length === 0
        ? `${compatibilityNote} Database records exist, but none are valid public-IP points with coordinates.`
        : compatibilityNote
          ? compatibilityNote
          : points.length === 0
            ? "Database records exist, but none are valid public-IP points with coordinates."
            : null,
  };
}

export async function loadLatestExposureSnapshot(): Promise<ExposureSnapshot> {
  const priority = getDataSourcePriority();
  const fallbackReasons: string[] = [];

  for (const source of priority) {
    try {
      const snapshot =
        source === "database"
          ? await loadLatestExposureSnapshotFromDatabase()
          : await loadLatestExposureSnapshotFromLocal();

      if (fallbackReasons.length > 0) {
        const fallbackNote = `Fallback activated (${fallbackReasons.join(" | ")}).`;
        snapshot.note = snapshot.note ? `${snapshot.note} ${fallbackNote}` : fallbackNote;
      }

      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fallbackReasons.push(`${source}: ${message}`);
    }
  }

  return {
    generatedAt: null,
    sourceFile: null,
    totalRecords: 0,
    publicRecords: 0,
    plottedPoints: 0,
    countries: [],
    points: [],
    note: `Failed to load exposure snapshot from all configured sources. ${fallbackReasons.join(" | ")}`,
  };
}
