#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  getDictionaryNumber,
  getDictionaryString,
  seedRuntimeDictionary,
} from "../lib/server/dictionary-store.mjs";

const DEFAULT_BASE_URL = "https://app.netlas.io";
const DEFAULT_OPENCLAW_QUERY = "(http.title:\"OpenClaw Control\") OR (http.body:\"openclaw-app\") OR (http.body:\"__OPENCLAW_CONTROL_UI_BASE_PATH__\")";
const SEARCH_PATH = "/api/responses/";

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function toMonthDate(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}-01`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function deriveEncryptionKey(secret) {
  return createHash("sha256").update(secret).digest();
}

function encryptApiKey(apiKey, secret) {
  const iv = randomBytes(12);
  const key = deriveEncryptionKey(secret);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
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
  return [...new Set([...list, ...numbered, ...(single ? [single] : [])])];
}

function toPort(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) return parsed;
  return null;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function pick(obj, pathTokens) {
  let curr = obj;
  for (const token of pathTokens) {
    if (curr == null) return undefined;
    if (Array.isArray(curr)) {
      const i = Number.parseInt(token, 10);
      if (!Number.isInteger(i) || i < 0 || i >= curr.length) return undefined;
      curr = curr[i];
    } else if (typeof curr === "object") {
      curr = curr[token];
    } else {
      return undefined;
    }
  }
  return curr;
}

function normalizeIp(ip) {
  return typeof ip === "string" ? ip.trim().replace(/^\[|\]$/g, "") : "";
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

function extractItems(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function classify429(detail, retryAfter) {
  const text = String(detail ?? "").toLowerCase();
  if (text.includes("daily") && text.includes("limit")) return "quota_exhausted";
  if (typeof retryAfter === "number") return "throttled";
  return "throttled";
}

async function callNetlas({ apiKey, baseUrl, query, start, timeoutMs }) {
  const endpoint = new URL(SEARCH_PATH, baseUrl);
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("start", String(start));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = new Date();

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? asInt(retryAfterHeader, 0) : null;
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const bodyText = await response.text();

    let bodyJson = null;
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = null;
    }

    if (!response.ok) {
      const detail = bodyText.slice(0, 4000);
      let status = "upstream_error";
      if (response.status === 402) status = "quota_exhausted";
      else if (response.status === 429) status = classify429(detail, retryAfter);
      else if (response.status === 504) status = "timeout";

      return {
        status,
        httpStatus: response.status,
        retryAfter,
        errorCode: `HTTP_${response.status}`,
        errorMessage: detail || response.statusText,
        responseHeaders,
        responseBody: bodyJson,
        responseBodyText: bodyJson ? null : bodyText,
        startedAt,
        finishedAt,
        durationMs,
        items: [],
      };
    }

    return {
      status: "ok",
      httpStatus: response.status,
      retryAfter,
      errorCode: null,
      errorMessage: null,
      responseHeaders,
      responseBody: bodyJson,
      responseBodyText: bodyJson ? null : bodyText,
      startedAt,
      finishedAt,
      durationMs,
      items: extractItems(bodyJson ?? {}),
    };
  } catch (error) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const isAbort = error && typeof error === "object" && error.name === "AbortError";

    return {
      status: isAbort ? "timeout" : "unknown",
      httpStatus: null,
      retryAfter: null,
      errorCode: isAbort ? "CLIENT_TIMEOUT" : "NETWORK_ERROR",
      errorMessage: error instanceof Error ? error.message : String(error),
      responseHeaders: null,
      responseBody: null,
      responseBodyText: null,
      startedAt,
      finishedAt,
      durationMs,
      items: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeHit(item, index, query, queryHash) {
  const data = item && typeof item === "object" && item.data && typeof item.data === "object" ? item.data : item;

  const ip = normalizeIp(String(pick(data, ["ip"]) ?? pick(item, ["ip"]) ?? ""));
  const port = toPort(pick(data, ["port"]) ?? pick(item, ["port"]));
  const country = String(pick(data, ["geo", "country"]) ?? pick(data, ["country"]) ?? "Unknown").trim() || "Unknown";
  const countryCode = pick(data, ["geo", "country_code"]) ?? null;
  const city = pick(data, ["geo", "city"]) ?? null;
  const latitude = toNumber(pick(data, ["geo", "location", "lat"]) ?? pick(data, ["latitude"]));
  const longitude = toNumber(pick(data, ["geo", "location", "lon"]) ?? pick(data, ["longitude"]));
  const transport = pick(data, ["transport"]) ?? null;
  const protocol = pick(data, ["protocol"]) ?? pick(data, ["service", "protocol"]) ?? "unknown";
  const netlasItemId = pick(data, ["_id"]) ?? pick(item, ["id"]) ?? null;

  if (!ip || !isPublicIp(ip)) return { valid: false, reason: "invalid_or_non_public_ip" };
  if (latitude === null || longitude === null || !isValidCoordinate(latitude, longitude)) {
    return { valid: false, reason: "invalid_coordinates" };
  }

  const protocolNorm = String(protocol).toLowerCase();
  const assetKey = `${ip}|${port ?? 0}|${protocolNorm}`;
  const hitHash = sha256(`${assetKey}|${country.toLowerCase()}|${latitude.toFixed(4)}|${longitude.toFixed(4)}|${queryHash}`);

  return {
    valid: true,
    hit: {
      query,
      queryHash,
      netlasItemIndex: index,
      netlasItemId: typeof netlasItemId === "string" ? netlasItemId : null,
      hitHash,
      assetKey,
      ip,
      port,
      transport: typeof transport === "string" ? transport : null,
      protocol: protocolNorm,
      country,
      countryCode: typeof countryCode === "string" ? countryCode : null,
      city: typeof city === "string" ? city : null,
      latitude,
      longitude,
      observedAt: null,
      rawHit: item,
    },
  };
}

async function bootstrapSchema(client) {
  const schemaSql = await readFile(new URL("../docs/NEON-SCHEMA.sql", import.meta.url), "utf8");
  await client.query(schemaSql);
}

async function upsertKey(client, keyId, apiKey, encryptedApiKey) {
  const fingerprint = sha256(apiKey).slice(0, 16);
  await client.query(
    `
      insert into netlas_keys (key_id, key_fingerprint, api_key_ciphertext, is_active, state, updated_at)
      values ($1, $2, $3, true, 'healthy', now())
      on conflict (key_id)
      do update set
        key_fingerprint = excluded.key_fingerprint,
        api_key_ciphertext = excluded.api_key_ciphertext,
        is_active = true,
        updated_at = now()
    `,
    [keyId, fingerprint, encryptedApiKey]
  );
}

async function bumpUsage(client, keyId, status) {
  const usageDate = toIsoDate();
  const usageMonth = toMonthDate();
  const requestsInc = status === "ok" ? 1 : 0;
  const unknownInc = status === "unknown" ? 1 : 0;

  await client.query(
    `
      insert into netlas_key_usage_daily (key_id, usage_date, used_requests, unknown_pending, updated_at)
      values ($1, $2, $3, $4, now())
      on conflict (key_id, usage_date)
      do update set
        used_requests = netlas_key_usage_daily.used_requests + excluded.used_requests,
        unknown_pending = netlas_key_usage_daily.unknown_pending + excluded.unknown_pending,
        updated_at = now()
    `,
    [keyId, usageDate, requestsInc, unknownInc]
  );

  await client.query(
    `
      insert into netlas_key_usage_monthly (key_id, usage_month, used_requests, updated_at)
      values ($1, $2, $3, now())
      on conflict (key_id, usage_month)
      do update set
        used_requests = netlas_key_usage_monthly.used_requests + excluded.used_requests,
        updated_at = now()
    `,
    [keyId, usageMonth, requestsInc]
  );
}

async function upsertHitRecord(client, { syncJobId, requestId, keyId, hit }) {
  const updateResult = await client.query(
    `
      update netlas_hits
      set
        sync_job_id = $2,
        request_id = $3,
        key_id = $4,
        query = $5,
        query_hash = $6,
        netlas_item_index = $7,
        netlas_item_id = $8,
        asset_key = $9,
        ip = $10::inet,
        port = $11,
        transport = $12,
        protocol = $13,
        country = $14,
        country_code = $15,
        city = $16,
        latitude = $17,
        longitude = $18,
        observed_at = $19,
        last_seen_at = now(),
        seen_count = netlas_hits.seen_count + 1,
        raw_hit = $20
      where hit_hash = $1
      returning id
    `,
    [
      hit.hitHash,
      syncJobId,
      requestId,
      keyId,
      hit.query,
      hit.queryHash,
      hit.netlasItemIndex,
      hit.netlasItemId,
      hit.assetKey,
      hit.ip,
      hit.port,
      hit.transport,
      hit.protocol,
      hit.country,
      hit.countryCode,
      hit.city,
      hit.latitude,
      hit.longitude,
      hit.observedAt,
      hit.rawHit,
    ]
  );

  if (updateResult.rowCount > 0) {
    return "updated";
  }

  await client.query(
    `
      insert into netlas_hits (
        sync_job_id,
        request_id,
        key_id,
        provider,
        query,
        query_hash,
        netlas_item_index,
        netlas_item_id,
        hit_hash,
        asset_key,
        ip,
        port,
        transport,
        protocol,
        country,
        country_code,
        city,
        latitude,
        longitude,
        observed_at,
        first_seen_at,
        last_seen_at,
        seen_count,
        raw_hit
      )
      values (
        $1, $2, $3, 'netlas', $4, $5, $6, $7, $8, $9,
        $10::inet, $11, $12, $13, $14, $15, $16, $17, $18, $19, now(), now(), 1, $20
      )
    `,
    [
      syncJobId,
      requestId,
      keyId,
      hit.query,
      hit.queryHash,
      hit.netlasItemIndex,
      hit.netlasItemId,
      hit.hitHash,
      hit.assetKey,
      hit.ip,
      hit.port,
      hit.transport,
      hit.protocol,
      hit.country,
      hit.countryCode,
      hit.city,
      hit.latitude,
      hit.longitude,
      hit.observedAt,
      hit.rawHit,
    ]
  );

  return "inserted";
}

function computeRemainingHourlyRuns(now = new Date()) {
  const currentHourUtc = now.getUTCHours();
  return Math.max(1, 24 - currentHourUtc);
}

async function loadTodayUsageByKey(client, keyIds) {
  if (!Array.isArray(keyIds) || keyIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `
      select key_id, used_requests
      from netlas_key_usage_daily
      where usage_date = $1
        and key_id = any($2::text[])
    `,
    [toIsoDate(), keyIds]
  );

  const usage = new Map();
  for (const row of result.rows) {
    usage.set(String(row.key_id), Math.max(0, asInt(row.used_requests, 0)));
  }
  return usage;
}

export async function runNetlasValidation(options = {}) {
  const databaseUrl = String(process.env.DATABASE_URL ?? "").trim();
  const baseUrl = (String(process.env.NETLAS_BASE_URL ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const query = String(process.env.NETLAS_QUERY ?? "").trim() || DEFAULT_OPENCLAW_QUERY;
  const timeoutMs = asInt(process.env.NETLAS_TIMEOUT_MS, 30000);
  const start = asInt(process.env.NETLAS_VALIDATION_START, 0);
  const startStep = asInt(process.env.NETLAS_VALIDATION_START_STEP ?? process.env.NETLAS_START_STEP, 20);
  const maxPages = asInt(process.env.NETLAS_VALIDATION_MAX_PAGES ?? process.env.NETLAS_MAX_PAGES, 10);
  const dailyRequestBudgetPerKey = asInt(process.env.NETLAS_DAILY_REQUEST_BUDGET_PER_KEY, 50);
  const requestedMaxKeys = parseOptionalInt(options.maxKeys ?? process.env.NETLAS_VALIDATION_MAX_KEYS);
  const runType = String(options.runType ?? "manual").trim() || "manual";

  if (!databaseUrl) throw new Error("Missing required env: DATABASE_URL");
  if (!Number.isInteger(startStep) || startStep < 1 || startStep > 1000) {
    throw new Error("NETLAS_VALIDATION_START_STEP (or NETLAS_START_STEP) must be an integer between 1 and 1000.");
  }
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 500) {
    throw new Error("NETLAS_VALIDATION_MAX_PAGES (or NETLAS_MAX_PAGES) must be an integer between 1 and 500.");
  }
  if (!Number.isInteger(dailyRequestBudgetPerKey) || dailyRequestBudgetPerKey < 1 || dailyRequestBudgetPerKey > 5000) {
    throw new Error("NETLAS_DAILY_REQUEST_BUDGET_PER_KEY must be an integer between 1 and 5000.");
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: /sslmode=require/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    await bootstrapSchema(client);
    await seedRuntimeDictionary(client);

    const encryptionSecret = String(await getDictionaryString(client, "netlas.secrets.encryption_key", "")).trim();
    if (!encryptionSecret) {
      throw new Error("Dictionary `netlas.secrets.encryption_key` is empty.");
    }

    const allKeys = parseApiKeys();
    if (allKeys.length === 0) {
      throw new Error("Missing Netlas API keys. Set NETLAS_API_KEYS or NETLAS_API_KEY_1/2.");
    }

    const defaultMaxKeys = Math.max(1, asInt(await getDictionaryNumber(client, "netlas.validation.default_max_keys", allKeys.length), allKeys.length));
    const maxKeysLimit = Math.max(defaultMaxKeys, asInt(await getDictionaryNumber(client, "netlas.validation.max_keys_limit", 20), 20));
    const desiredMaxKeys = requestedMaxKeys ?? (runType === "scheduled" ? allKeys.length : defaultMaxKeys);
    const resolvedMaxKeys = Math.min(Math.max(desiredMaxKeys, 1), maxKeysLimit, allKeys.length);

    const keys = allKeys.slice(0, resolvedMaxKeys);
    const queryHash = sha256(query);
    const jobId = `validation-${runType}-${new Date().toISOString().replace(/[:.]/g, "-")}`;

    const syncJobInsert = await client.query(
      `
        insert into netlas_sync_jobs (job_id, run_type, query, query_hash, base_url, final_status, started_at)
        values ($1, $2, $3, $4, $5, 'running', now())
        returning id
      `,
      [jobId, runType, query, queryHash, baseUrl]
    );

    const syncJobId = syncJobInsert.rows[0].id;

    const keyPool = [];
    for (let i = 0; i < keys.length; i += 1) {
      const apiKey = keys[i];
      const keyId = `k${i + 1}`;
      const encryptedApiKey = encryptApiKey(apiKey, encryptionSecret);
      await upsertKey(client, keyId, apiKey, encryptedApiKey);

      keyPool.push({
        keyId,
        apiKey,
        usedToday: 0,
        remainingToday: 0,
        blocked: false,
        pagesFetched: 0,
        inserted: 0,
        updated: 0,
        invalid: 0,
        duplicateInRun: 0,
        lastStatus: null,
        lastHttpStatus: null,
        lastErrorCode: null,
        stopReason: null,
      });
    }

    const usageByKey = await loadTodayUsageByKey(
      client,
      keyPool.map((key) => key.keyId)
    );

    for (const key of keyPool) {
      key.usedToday = usageByKey.get(key.keyId) ?? 0;
      key.remainingToday = Math.max(0, dailyRequestBudgetPerKey - key.usedToday);
    }

    const totalRemainingBudget = keyPool.reduce((acc, key) => acc + key.remainingToday, 0);
    const remainingRunsToday = computeRemainingHourlyRuns(new Date());
    const targetRequestsThisRun =
      totalRemainingBudget > 0 ? Math.max(1, Math.ceil(totalRemainingBudget / remainingRunsToday)) : 0;
    const plannedRequestsThisRun = Math.min(maxPages, targetRequestsThisRun, totalRemainingBudget);

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalInvalid = 0;
    let totalDuplicateInRun = 0;
    let totalPagesFetched = 0;
    let okCount = 0;
    let failedCount = 0;
    let stopReason = plannedRequestsThisRun === 0 ? "no_budget_remaining" : "max_requests_planned";
    let nextStartOffset = start;
    let observedPageSize = null;

    let roundRobinCursor = 0;

    for (let requestIndex = 0; requestIndex < plannedRequestsThisRun; requestIndex += 1) {
      let selectedKey = null;

      for (let attempt = 0; attempt < keyPool.length; attempt += 1) {
        const candidateIndex = (roundRobinCursor + attempt) % keyPool.length;
        const candidate = keyPool[candidateIndex];
        if (candidate.blocked || candidate.remainingToday <= 0) continue;

        selectedKey = candidate;
        roundRobinCursor = (candidateIndex + 1) % keyPool.length;
        break;
      }

      if (!selectedKey) {
        stopReason = "no_available_key";
        break;
      }

      const startOffset = nextStartOffset;
      const requestId = randomUUID();
      const result = await callNetlas({
        apiKey: selectedKey.apiKey,
        baseUrl,
        query,
        start: startOffset,
        timeoutMs,
      });

      selectedKey.pagesFetched += 1;
      totalPagesFetched += 1;
      selectedKey.lastStatus = result.status;
      selectedKey.lastHttpStatus = result.httpStatus;
      selectedKey.lastErrorCode = result.errorCode;

      const responseBodyText =
        typeof result.responseBodyText === "string" && result.responseBodyText.length > 120000
          ? result.responseBodyText.slice(0, 120000)
          : result.responseBodyText;

      await client.query(
        `
          insert into netlas_requests (
            request_id, sync_job_id, key_id, endpoint, query, query_hash,
            start_offset, page_size, status, http_status, retry_after_seconds,
            error_code, error_message, duration_ms, request_headers,
            response_headers, response_body, response_body_text, started_at, finished_at
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, null, $8, $9, $10,
            $11, $12, $13, null, $14, $15, $16, $17, $18
          )
        `,
        [
          requestId,
          syncJobId,
          selectedKey.keyId,
          SEARCH_PATH,
          query,
          queryHash,
          startOffset,
          result.status,
          result.httpStatus,
          result.retryAfter,
          result.errorCode,
          result.errorMessage,
          result.durationMs,
          result.responseHeaders,
          result.responseBody,
          responseBodyText,
          result.startedAt,
          result.finishedAt,
        ]
      );

      await bumpUsage(client, selectedKey.keyId, result.status);

      if (result.status !== "ok") {
        failedCount += 1;
        selectedKey.stopReason = `request_${result.status}`;

        if (result.status === "quota_exhausted") {
          selectedKey.remainingToday = 0;
          selectedKey.blocked = true;
          await client.query(
            `
              update netlas_keys
              set state = 'quota_exhausted_daily', last_error_code = $2, last_error_message = $3, last_error_at = now(), updated_at = now()
              where key_id = $1
            `,
            [selectedKey.keyId, result.errorCode, result.errorMessage]
          );
        } else if (result.status === "throttled") {
          selectedKey.blocked = true;
          await client.query(
            `
              update netlas_keys
              set state = 'cooldown', cooldown_until = now() + interval '1 minute', last_error_code = $2, last_error_message = $3, last_error_at = now(), updated_at = now()
              where key_id = $1
            `,
            [selectedKey.keyId, result.errorCode, result.errorMessage]
          );
        } else {
          selectedKey.blocked = true;
        }

        continue;
      }

      okCount += 1;
      selectedKey.remainingToday = Math.max(0, selectedKey.remainingToday - 1);

      await client.query(
        `
          update netlas_keys
          set state = 'healthy', last_success_at = now(), updated_at = now()
          where key_id = $1
        `,
        [selectedKey.keyId]
      );

      const seenInRequest = new Set();

      for (let index = 0; index < result.items.length; index += 1) {
        const normalized = normalizeHit(result.items[index], index, query, queryHash);
        if (!normalized.valid) {
          selectedKey.invalid += 1;
          totalInvalid += 1;
          continue;
        }

        const hit = normalized.hit;
        if (seenInRequest.has(hit.hitHash)) {
          selectedKey.duplicateInRun += 1;
          totalDuplicateInRun += 1;
          continue;
        }
        seenInRequest.add(hit.hitHash);

        const action = await upsertHitRecord(client, { syncJobId, requestId, keyId: selectedKey.keyId, hit });
        if (action === "inserted") {
          selectedKey.inserted += 1;
          totalInserted += 1;
        } else {
          selectedKey.updated += 1;
          totalUpdated += 1;
        }
      }

      if (result.items.length === 0) {
        stopReason = "empty_page";
        selectedKey.stopReason = "empty_page";
        break;
      }

      if (observedPageSize === null) {
        observedPageSize = result.items.length;
      }

      const expectedPageSize = observedPageSize ?? startStep;
      nextStartOffset += result.items.length;

      if (result.items.length < expectedPageSize) {
        stopReason = "last_page_short";
        selectedKey.stopReason = "last_page_short";
        break;
      }
    }

    const perKeyResults = keyPool.map((key) => ({
      keyId: key.keyId,
      status: key.lastStatus ?? (key.remainingToday <= 0 ? "quota_exhausted" : "idle"),
      httpStatus: key.lastHttpStatus,
      pagesFetched: key.pagesFetched,
      inserted: key.inserted,
      updated: key.updated,
      invalid: key.invalid,
      duplicateInRun: key.duplicateInRun,
      usedToday: key.usedToday,
      remainingToday: key.remainingToday,
      stopReason: key.stopReason,
      errorCode: key.lastErrorCode,
    }));

    const finalStatus = okCount > 0 || plannedRequestsThisRun === 0 ? "ok" : "failed";
    const summary = {
      ok_count: okCount,
      failed_count: failedCount,
      pages_fetched: totalPagesFetched,
      planned_requests: plannedRequestsThisRun,
      remaining_runs_today: remainingRunsToday,
      total_remaining_budget: totalRemainingBudget,
      per_key_daily_budget: dailyRequestBudgetPerKey,
      observed_page_size: observedPageSize,
      inserted: totalInserted,
      updated: totalUpdated,
      invalid_filtered: totalInvalid,
      duplicate_in_run_filtered: totalDuplicateInRun,
      stop_reason: stopReason,
      key_results: perKeyResults,
    };

    await client.query(
      `
        update netlas_sync_jobs
        set
          processed_targets = $2,
          pages_fetched = $3,
          total_hits = $4,
          deduped_hits = $5,
          final_status = $6,
          summary = $7,
          finished_at = now()
        where id = $1
      `,
      [syncJobId, keys.length, totalPagesFetched, totalInserted + totalUpdated, totalInserted, finalStatus, summary]
    );

    console.log("Validation finished.");
    console.log(`Sync job id: ${syncJobId}`);
    console.log(`Job key: ${jobId}`);
    console.log(`Keys in pool: ${keys.length}`);
    console.log(`Planned requests this run: ${plannedRequestsThisRun}`);
    console.log(`Pages fetched: ${totalPagesFetched}`);
    console.log(`Inserted: ${totalInserted}, Updated(existing): ${totalUpdated}`);
    console.log(`Invalid filtered: ${totalInvalid}, Duplicate-in-run filtered: ${totalDuplicateInRun}`);
    console.log(`Stop reason: ${stopReason}`);
    console.table(perKeyResults);

    return {
      syncJobId,
      jobId,
      runType,
      maxKeysRequested: requestedMaxKeys,
      maxKeysResolved: resolvedMaxKeys,
      keysInPool: keys.length,
      plannedRequestsThisRun,
      pagesFetched: totalPagesFetched,
      inserted: totalInserted,
      updated: totalUpdated,
      invalidFiltered: totalInvalid,
      duplicateInRunFiltered: totalDuplicateInRun,
      stopReason,
      finalStatus,
      perKeyResults,
    };
  } finally {
    await client.end();
  }
}
const isDirectRun = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runNetlasValidation({ runType: "manual" }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

