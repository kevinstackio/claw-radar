import { Pool } from "pg";

import type { CountryExposure, ExposurePoint, ExposureSnapshot } from "@/lib/exposure-types";

type MutablePoint = {
  ip: string;
  country: string;
  city: string | null;
  latitude: number;
  longitude: number;
  latestSeenAtEpochMs: number;
  isp: string | null;
  asnName: string | null;
  asnNumber: string | null;
  organization: string | null;
  ipCount: number;
  ports: Set<number>;
};

type DatabasePointRow = {
  ip: string | null;
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  isp: string | null;
  asn_name: string | null;
  asn_number: string | null;
  organization: string | null;
  ports: unknown;
  last_seen_at: string | Date | null;
};

type SyncJobRow = {
  started_at: string | Date | null;
};

const DATABASE_SOURCE_FILE = "database:netlas_hits";

const globalForPg = globalThis as typeof globalThis & {
  __clawRadarPool?: Pool;
};

function normalizeIp(raw: string): string {
  return raw.trim().replace(/^\[|\]$/g, "");
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;

  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === "string") {
            const text = item.trim();
            if (text.length > 0) return text;
          } else if (item !== null && item !== undefined) {
            const text = String(item).trim();
            if (text.length > 0) return text;
          }
        }
        return null;
      }
    } catch {
      // Keep original normalized string when not valid JSON.
    }
  }

  return normalized;
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

function toCountrySeries(countryCounts: Map<string, number>): CountryExposure[] {
  return [...countryCounts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function toPoints(pointMap: Map<string, MutablePoint>): ExposurePoint[] {
  return [...pointMap.values()].map((point) => ({
    name: point.country || point.ip,
    ip: point.ip,
    country: point.country || "Unknown",
    city: point.city,
    portSummary: [...point.ports].sort((a, b) => a - b).join(", "),
    isp: point.isp,
    asnName: point.asnName,
    asnNumber: point.asnNumber,
    organization: point.organization,
    ipCount: point.ipCount,
    value: [point.longitude, point.latitude, point.ipCount],
  }));
}

async function loadLastSuccessfulSyncStartedAt(pool: Pool): Promise<string | null> {
  try {
    const result = await pool.query<SyncJobRow>(
      `
        select started_at
        from netlas_sync_jobs
        where final_status = 'ok'
        order by started_at desc
        limit 1
      `
    );

    if (result.rowCount === 0) {
      return null;
    }

    const startedAt = result.rows[0]?.started_at;
    if (!startedAt) {
      return null;
    }

    const date = new Date(startedAt);
    return Number.isNaN(date.getTime()) ? String(startedAt) : date.toISOString();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/relation "netlas_sync_jobs" does not exist/i.test(message)) {
      return null;
    }
    throw error;
  }
}

async function loadLatestExposureSnapshotFromDatabase(): Promise<ExposureSnapshot> {
  const pool = getDatabasePool();
  const lastSuccessfulSyncStartedAt = await loadLastSuccessfulSyncStartedAt(pool);
  let usedLegacyAggregation = false;
  let result;

  try {
    result = await pool.query<DatabasePointRow>(`
      select
        host(ip) as ip,
        (array_remove(array_agg(nullif(city, '') order by last_seen_at desc), null))[1] as city,
        coalesce((array_remove(array_agg(nullif(country, '') order by last_seen_at desc), null))[1], 'Unknown') as country,
        (array_remove(array_agg(latitude order by last_seen_at desc), null))[1] as latitude,
        (array_remove(array_agg(longitude order by last_seen_at desc), null))[1] as longitude,
        (array_remove(array_agg(nullif(raw_hit->'data'->>'isp', '') order by last_seen_at desc), null))[1] as isp,
        (array_remove(array_agg(nullif(raw_hit->'data'->'whois'->'asn'->>'name', '') order by last_seen_at desc), null))[1] as asn_name,
        (array_remove(array_agg(nullif(raw_hit->'data'->'whois'->'asn'->>'number', '') order by last_seen_at desc), null))[1] as asn_number,
        (array_remove(array_agg(nullif(raw_hit->'data'->'whois'->'net'->>'organization', '') order by last_seen_at desc), null))[1] as organization,
        array_remove(array_agg(distinct port order by port), null) as ports,
        max(last_seen_at) as last_seen_at
      from netlas_hits
      where ip is not null
        and latitude is not null
        and longitude is not null
      group by host(ip)
    `);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isSchemaDrift = /column "last_seen_at" does not exist/i.test(message);

    if (!isSchemaDrift) {
      throw error;
    }

    usedLegacyAggregation = true;
    result = await pool.query<DatabasePointRow>(`
      select
        host(ip) as ip,
        coalesce(max(nullif(country, '')), 'Unknown') as country,
        max(nullif(city, '')) as city,
        max(latitude) as latitude,
        max(longitude) as longitude,
        max(nullif(raw_hit->'data'->>'isp', '')) as isp,
        max(nullif(raw_hit->'data'->'whois'->'asn'->>'name', '')) as asn_name,
        max(nullif(raw_hit->'data'->'whois'->'asn'->>'number', '')) as asn_number,
        max(nullif(raw_hit->'data'->'whois'->'net'->>'organization', '')) as organization,
        array_remove(array_agg(distinct port order by port), null) as ports,
        null::timestamptz as last_seen_at
      from netlas_hits
      where ip is not null
        and latitude is not null
        and longitude is not null
      group by host(ip)
    `);
  }

  const compatibilityNote = usedLegacyAggregation
    ? "Database schema is outdated (missing `last_seen_at`). Run `pnpm netlas:validate` to migrate schema."
    : null;

  if (result.rowCount === 0) {
    return {
      generatedAt: lastSuccessfulSyncStartedAt,
      sourceFile: DATABASE_SOURCE_FILE,
      totalIps: 0,
      countries: [],
      points: [],
      note: compatibilityNote
        ? `No records found in database table \`netlas_hits\`. Run the Netlas sync job first. ${compatibilityNote}`
        : "No records found in database table `netlas_hits`. Run the Netlas sync job first.",
    };
  }

  const pointMap = new Map<string, MutablePoint>();
  const countryCounts = new Map<string, number>();
  let totalIps = 0;
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

    const country = String(row.country ?? "Unknown").trim() || "Unknown";
    const city = normalizeOptionalText(row.city);
    const ports = normalizePortList(row.ports);
    const rowLastSeenEpochMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
    const isp = normalizeOptionalText(row.isp);
    const asnName = normalizeOptionalText(row.asn_name);
    const asnNumber = normalizeOptionalText(row.asn_number);
    const organization = normalizeOptionalText(row.organization);

    totalIps += 1;
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1);

    const key = ip;
    const existing = pointMap.get(key);
    if (existing) {
      for (const port of ports) {
        existing.ports.add(port);
      }

      if (Number.isFinite(rowLastSeenEpochMs) && rowLastSeenEpochMs > existing.latestSeenAtEpochMs) {
        existing.latestSeenAtEpochMs = rowLastSeenEpochMs;
        existing.country = country;
        existing.city = city;
        existing.latitude = latitude;
        existing.longitude = longitude;
        existing.isp = isp ?? existing.isp;
        existing.asnName = asnName ?? existing.asnName;
        existing.asnNumber = asnNumber ?? existing.asnNumber;
        existing.organization = organization ?? existing.organization;
      } else {
        if (!existing.isp && isp) existing.isp = isp;
        if (!existing.asnName && asnName) existing.asnName = asnName;
        if (!existing.asnNumber && asnNumber) existing.asnNumber = asnNumber;
        if (!existing.organization && organization) existing.organization = organization;
      }
    } else {
      pointMap.set(key, {
        ip,
        country,
        city,
        latitude,
        longitude,
        latestSeenAtEpochMs: Number.isFinite(rowLastSeenEpochMs) ? rowLastSeenEpochMs : 0,
        isp,
        asnName,
        asnNumber,
        organization,
        ipCount: 1,
        ports: new Set(ports),
      });
    }

    if (Number.isFinite(rowLastSeenEpochMs) && rowLastSeenEpochMs > generatedAtEpochMs) {
      generatedAtEpochMs = rowLastSeenEpochMs;
    }
  }

  const points = toPoints(pointMap);
  const countries = toCountrySeries(countryCounts);

  return {
    generatedAt:
      lastSuccessfulSyncStartedAt ?? (generatedAtEpochMs > 0 ? new Date(generatedAtEpochMs).toISOString() : null),
    sourceFile: DATABASE_SOURCE_FILE,
    totalIps,
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
  try {
    return await loadLatestExposureSnapshotFromDatabase();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      generatedAt: null,
      sourceFile: null,
      totalIps: 0,
      countries: [],
      points: [],
      note: `Failed to load exposure snapshot from database. ${message}`,
    };
  }
}
