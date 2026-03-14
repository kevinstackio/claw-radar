#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BASE_URL = "https://app.netlas.io";
const DEFAULT_OPENCLAW_QUERY = "(http.title:\"OpenClaw Control\") OR (http.body:\"openclaw-app\") OR (http.body:\"__OPENCLAW_CONTROL_UI_BASE_PATH__\")";
const SEARCH_PATH = "/api/responses/";

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseApiKeys() {
  const list = String(process.env.NETLAS_API_KEYS ?? "")
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);

  const numbered = Object.keys(process.env)
    .filter((key) => /^NETLAS_API_KEY_\d+$/.test(key))
    .sort((a, b) => Number(a.split("_").pop()) - Number(b.split("_").pop()))
    .map((key) => String(process.env[key] ?? "").trim())
    .filter(Boolean);

  const single = String(process.env.NETLAS_API_KEY ?? "").trim();
  const merged = [...list, ...numbered, ...(single ? [single] : [])];
  return [...new Set(merged)];
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

function isPublicIPv4(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;

  const nums = parts.map((part) => Number.parseInt(part, 10));
  if (nums.some((num) => !Number.isInteger(num) || num < 0 || num > 255)) return false;

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

function isPublicIPv6(ip) {
  const value = ip.toLowerCase();
  if (!/^[0-9a-f:]+$/.test(value)) return false;
  if (value === "::1") return false;
  if (value.startsWith("fc") || value.startsWith("fd")) return false;
  if (value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb")) {
    return false;
  }
  return true;
}

function isPublicIp(ip) {
  if (!ip) return false;
  if (ip.includes(".")) return isPublicIPv4(ip);
  if (ip.includes(":")) return isPublicIPv6(ip);
  return false;
}

function isValidCoordinate(latitude, longitude) {
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function mapNetlasItem(item) {
  const data = item && typeof item === "object" && item.data && typeof item.data === "object" ? item.data : {};

  const ip = normalizeIp(String(data.ip ?? item.ip ?? ""));
  const port = toPort(data.port ?? item.port ?? data.service?.port);
  const latitude = toNumber(data.geo?.location?.lat ?? data.latitude ?? data.location?.coordinates?.latitude);
  const longitude = toNumber(data.geo?.location?.lon ?? data.longitude ?? data.location?.coordinates?.longitude);
  const countryRaw =
    (typeof data.geo?.country === "string" && data.geo.country.trim()) ||
    (typeof data.country === "string" && data.country.trim()) ||
    "Unknown";
  const country = countryRaw.trim() || "Unknown";
  const protocolRaw =
    (typeof data.protocol === "string" && data.protocol.trim()) ||
    (typeof data.service?.protocol === "string" && data.service.protocol.trim()) ||
    (typeof data.transport === "string" && data.transport.trim()) ||
    "unknown";
  const protocol = protocolRaw.toLowerCase();

  return {
    ip,
    port,
    latitude,
    longitude,
    country,
    protocol,
    raw: data,
  };
}

function validateMappedHit(mapped) {
  if (!mapped.ip || !isPublicIp(mapped.ip)) {
    return { valid: false, reason: "invalid_or_non_public_ip" };
  }

  if (mapped.latitude === null || mapped.longitude === null || !isValidCoordinate(mapped.latitude, mapped.longitude)) {
    return { valid: false, reason: "invalid_coordinates" };
  }

  return { valid: true, reason: null };
}

function toFingerprint(mapped) {
  return [
    mapped.ip,
    mapped.port ?? 0,
    mapped.protocol,
    mapped.country.toLowerCase(),
    mapped.latitude.toFixed(4),
    mapped.longitude.toFixed(4),
  ].join("|");
}

function mapNetlasItemToHit(mapped, sourceQuery) {
  return {
    ip: mapped.ip,
    port: mapped.port ?? undefined,
    protocol: mapped.protocol,
    location: {
      country: mapped.country,
      country_name: mapped.country,
      coordinates: {
        latitude: mapped.latitude,
        longitude: mapped.longitude,
      },
    },
    netlas: mapped.raw,
    _source: {
      provider: "netlas",
      query: sourceQuery,
    },
  };
}

function extractItems(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function shouldSwitchKeyForError(message) {
  const text = String(message ?? "").toLowerCase();
  return text.includes(" 401 ") || text.includes(" 402 ") || text.includes(" 403 ") || text.includes(" 429 ");
}

async function fetchPage({ baseUrl, apiKey, query, start, timeoutMs, maxRetries, retryBaseMs }) {
  const endpoint = new URL(SEARCH_PATH, baseUrl);
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("start", String(start));

  let attempt = 0;

  while (attempt <= maxRetries) {
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

      if (!response.ok) {
        const detail = text.slice(0, 500).replace(/\s+/g, " ").trim();
        if (isRetryableStatus(response.status) && attempt < maxRetries) {
          const retryAfterHeader = response.headers.get("retry-after");
          const retryAfterMs = retryAfterHeader ? Math.max(asInt(retryAfterHeader, 1), 1) * 1000 : 0;
          const backoffMs = retryAfterMs || retryBaseMs * (attempt + 1);
          attempt += 1;
          await sleep(backoffMs);
          continue;
        }
        throw new Error(`Netlas API returned ${response.status} ${response.statusText}. ${detail}`);
      }

      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Netlas API returned non-JSON payload: ${text.slice(0, 200)}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt < maxRetries) {
        attempt += 1;
        await sleep(retryBaseMs * attempt);
        continue;
      }
      throw new Error(`Network error while calling Netlas API: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Unexpected fetch retry loop exit.");
}

async function fetchPageWithKeyPool({ apiKeys, activeKeyIndex, ...rest }) {
  let currentIndex = activeKeyIndex;
  let lastError = null;

  for (let tries = 0; tries < apiKeys.length; tries += 1) {
    const apiKey = apiKeys[currentIndex];

    try {
      const payload = await fetchPage({ ...rest, apiKey });
      return { payload, keyIndex: currentIndex };
    } catch (error) {
      lastError = error;
      if (apiKeys.length === 1 || !shouldSwitchKeyForError(error instanceof Error ? error.message : String(error))) {
        throw error;
      }
      currentIndex = (currentIndex + 1) % apiKeys.length;
    }
  }

  throw lastError ?? new Error("All Netlas API keys failed.");
}

async function writeBackup({ query, baseUrl, items, pagesFetched, rawPages, includeRawPages, collectionStats, stopReason }) {
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
      itemCount: items.length,
      stopReason,
      collectionStats,
    },
    pages: rawPages.map((page, index) => ({
      page: index + 1,
      itemCount: extractItems(page).length,
      nextPageToken: "",
    })),
    items,
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
        latestBackup: path.relative(process.cwd(), backupFile).split(path.sep).join("/"),
        itemCount: items.length,
        pagesFetched,
        stopReason,
      },
      null,
      2
    )}\n`,
    "utf-8"
  );

  return { backupFile, latestFile, itemCount: items.length, stopReason };
}

async function main() {
  const apiKeys = parseApiKeys();
  const query = process.env.NETLAS_QUERY?.trim() || DEFAULT_OPENCLAW_QUERY;
  const baseUrl = (process.env.NETLAS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const maxPages = asInt(process.env.NETLAS_MAX_PAGES, 5);
  const startStep = asInt(process.env.NETLAS_START_STEP, 20);
  const timeoutMs = asInt(process.env.NETLAS_TIMEOUT_MS, 30000);
  const includeRawPages = toBool(process.env.NETLAS_INCLUDE_RAW_PAGES);

  const minNewPerPage = asInt(process.env.NETLAS_MIN_NEW_PER_PAGE, 3);
  const maxLowNewPages = asInt(process.env.NETLAS_MAX_LOW_NEW_PAGES, 2);
  const duplicateRatioStop = Number.parseFloat(String(process.env.NETLAS_DUPLICATE_RATIO_STOP ?? "0.92"));
  const maxRetries = asInt(process.env.NETLAS_FETCH_RETRIES, 1);
  const retryBaseMs = asInt(process.env.NETLAS_RETRY_BASE_MS, 800);

  if (apiKeys.length === 0) {
    throw new Error("Missing required env: NETLAS_API_KEY / NETLAS_API_KEYS / NETLAS_API_KEY_1");
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
  const collectedItems = [];
  const seenFingerprints = new Set();
  const pageStats = [];

  let activeKeyIndex = 0;
  let consecutiveLowNewPages = 0;
  let stopReason = "max_pages_reached";
  let nextStart = 0;
  let observedPageSize = null;

  for (let page = 0; page < maxPages; page += 1) {
    const start = nextStart;

    const { payload, keyIndex } = await fetchPageWithKeyPool({
      apiKeys,
      activeKeyIndex,
      baseUrl,
      query,
      start,
      timeoutMs,
      maxRetries,
      retryBaseMs,
    });

    activeKeyIndex = keyIndex;
    rawPages.push(payload);

    const pageItems = extractItems(payload);
    if (pageItems.length === 0) {
      stopReason = "empty_page";
      break;
    }

    const stat = {
      page: page + 1,
      start,
      rawItems: pageItems.length,
      newItems: 0,
      duplicateItems: 0,
      invalidItems: 0,
      keyIndex: keyIndex + 1,
    };

    for (const item of pageItems) {
      const mapped = mapNetlasItem(item);
      const validation = validateMappedHit(mapped);

      if (!validation.valid) {
        stat.invalidItems += 1;
        continue;
      }

      const fingerprint = toFingerprint(mapped);
      if (seenFingerprints.has(fingerprint)) {
        stat.duplicateItems += 1;
        continue;
      }

      seenFingerprints.add(fingerprint);
      stat.newItems += 1;
      collectedItems.push(mapNetlasItemToHit(mapped, query));
    }

    pageStats.push(stat);

    const duplicateRatio = stat.rawItems > 0 ? stat.duplicateItems / stat.rawItems : 0;
    const lowNew = stat.newItems < minNewPerPage || duplicateRatio >= duplicateRatioStop;

    if (lowNew) {
      consecutiveLowNewPages += 1;
    } else {
      consecutiveLowNewPages = 0;
    }

    if (stat.newItems === 0) {
      stopReason = "zero_new_items";
      break;
    }

    if (consecutiveLowNewPages >= maxLowNewPages) {
      stopReason = "low_incremental_yield";
      break;
    }

    if (observedPageSize === null) {
      observedPageSize = pageItems.length;
    }

    const expectedPageSize = observedPageSize ?? startStep;
    nextStart += pageItems.length;

    if (pageItems.length < expectedPageSize) {
      stopReason = "last_page_short";
      break;
    }
  }

  const collectionStats = {
    totalRawItems: pageStats.reduce((acc, s) => acc + s.rawItems, 0),
    totalNewItems: pageStats.reduce((acc, s) => acc + s.newItems, 0),
    totalDuplicateItems: pageStats.reduce((acc, s) => acc + s.duplicateItems, 0),
    totalInvalidItems: pageStats.reduce((acc, s) => acc + s.invalidItems, 0),
    pageStats,
  };

  const result = await writeBackup({
    query,
    baseUrl,
    items: collectedItems,
    pagesFetched: rawPages.length,
    rawPages,
    includeRawPages,
    collectionStats,
    stopReason,
  });

  console.log(`Backup written: ${result.backupFile}`);
  console.log(`Latest pointer: ${result.latestFile}`);
  console.log(`Fetched ${result.itemCount} deduped records across ${rawPages.length} page(s).`);
  console.log(`Stop reason: ${result.stopReason}`);
  console.log(`Collection stats: ${JSON.stringify(collectionStats)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
