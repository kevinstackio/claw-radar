#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = "https://app.netlas.io";
const SEARCH_PATH = "/api/responses/";

function asInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function normalizeIp(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^\[|\]$/g, "");
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toPort(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535) {
    return value;
  }
  if (typeof value === "string") {
    const match = value.match(/\d{1,5}/);
    if (match) {
      const parsed = Number.parseInt(match[0], 10);
      if (parsed > 0 && parsed <= 65535) return parsed;
    }
  }
  return null;
}

function mapNetlasItemToHit(item, sourceQuery) {
  const data = item && typeof item === "object" && item.data && typeof item.data === "object" ? item.data : {};
  const ip = normalizeIp(String(data.ip ?? item.ip ?? ""));
  const port = toPort(data.port ?? item.port);
  const country =
    (typeof data.geo?.country === "string" && data.geo.country.trim()) ||
    (typeof data.country === "string" && data.country.trim()) ||
    "";
  const latitude = toNumber(data.geo?.location?.lat ?? data.latitude);
  const longitude = toNumber(data.geo?.location?.lon ?? data.longitude);

  const hit = {
    ip,
    port: port ?? undefined,
    location: {
      country: country || undefined,
      country_name: country || undefined,
      coordinates: {
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
      },
    },
    netlas: data,
    _source: {
      provider: "netlas",
      query: sourceQuery,
    },
  };

  return hit;
}

async function fetchPage({ baseUrl, apiKey, query, start, timeoutMs }) {
  const endpoint = new URL(SEARCH_PATH, baseUrl);
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("start", String(start));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  let text = "";
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Network error while calling Netlas API: ${message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = text.slice(0, 500).replace(/\s+/g, " ").trim();
    throw new Error(`Netlas API returned ${response.status} ${response.statusText}. ${detail}`);
  }

  try {
    const payload = JSON.parse(text);
    return payload;
  } catch {
    throw new Error(`Netlas API returned non-JSON payload: ${text.slice(0, 200)}`);
  }
}

function extractItems(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

async function writeBackup({ query, baseUrl, hits, pagesFetched, rawPages, includeRawPages }) {
  const now = new Date();
  const iso = now.toISOString();
  const day = iso.slice(0, 10);
  const stamp = iso.replace(/[:.]/g, "-");
  const dayDir = path.join(process.cwd(), "data", "backups", "exposure", day);
  const backupFile = path.join(dayDir, `openclaw-netlas-${stamp}.json`);

  await mkdir(dayDir, { recursive: true });

  const payload = {
    meta: {
      source: "netlas-api",
      endpoint: `${baseUrl}${SEARCH_PATH}`,
      generatedAt: iso,
      query,
      pagesFetched,
      hitCount: hits.length,
    },
    pages: rawPages.map((page, index) => ({
      page: index + 1,
      hitCount: extractItems(page).length,
      nextPageToken: "",
    })),
    hits,
  };

  if (includeRawPages) {
    payload.rawPages = rawPages;
  }

  await writeFile(backupFile, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

  const latestFile = path.join(process.cwd(), "data", "backups", "exposure", "latest.json");
  await writeFile(
    latestFile,
    `${JSON.stringify(
      {
        generatedAt: iso,
        latestBackup: path.relative(process.cwd(), backupFile),
        hitCount: hits.length,
        pagesFetched,
      },
      null,
      2
    )}\n`,
    "utf-8"
  );

  return { backupFile, latestFile, hitCount: hits.length };
}

async function main() {
  const apiKey = process.env.NETLAS_API_KEY?.trim();
  const query = process.env.NETLAS_QUERY?.trim() || "port:18789";
  const baseUrl = (process.env.NETLAS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const maxPages = asInt(process.env.NETLAS_MAX_PAGES, 5);
  const startStep = asInt(process.env.NETLAS_START_STEP, 20);
  const timeoutMs = asInt(process.env.NETLAS_TIMEOUT_MS, 30000);
  const includeRawPages = toBool(process.env.NETLAS_INCLUDE_RAW_PAGES);

  if (!apiKey) {
    throw new Error("Missing required env: NETLAS_API_KEY");
  }
  if (!query) {
    throw new Error("Missing required env: NETLAS_QUERY");
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 500) {
    throw new Error("NETLAS_MAX_PAGES must be an integer between 1 and 500.");
  }
  if (!Number.isInteger(startStep) || startStep < 1 || startStep > 1000) {
    throw new Error("NETLAS_START_STEP must be an integer between 1 and 1000.");
  }

  const rawPages = [];
  const hits = [];

  for (let page = 0; page < maxPages; page += 1) {
    const start = page * startStep;
    const payload = await fetchPage({ baseUrl, apiKey, query, start, timeoutMs });
    rawPages.push(payload);

    const items = extractItems(payload);
    if (items.length === 0) {
      break;
    }

    items.forEach((item) => {
      hits.push(mapNetlasItemToHit(item, query));
    });

    if (items.length < startStep) {
      break;
    }
  }

  const dedupedMap = new Map();
  hits.forEach((hit) => {
    const lat = toNumber(hit.location?.coordinates?.latitude);
    const lon = toNumber(hit.location?.coordinates?.longitude);
    const key = `${normalizeIp(hit.ip)}|${hit.port ?? 0}|${lat !== null ? lat.toFixed(4) : "na"}|${
      lon !== null ? lon.toFixed(4) : "na"
    }`;
    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, hit);
    }
  });

  const dedupedHits = [...dedupedMap.values()];
  const result = await writeBackup({
    query,
    baseUrl,
    hits: dedupedHits,
    pagesFetched: rawPages.length,
    rawPages,
    includeRawPages,
  });

  console.log(`Backup written: ${result.backupFile}`);
  console.log(`Latest pointer: ${result.latestFile}`);
  console.log(`Fetched ${result.hitCount} deduped records across ${rawPages.length} page(s).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
