#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const DEFAULT_BASE_URL = "https://app.netlas.io";
const SEARCH_PATH = "/api/responses/";

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

export async function runNetlasValidation(options = {}) {
  const databaseUrl = String(process.env.DATABASE_URL ?? "").trim();
  const encryptionSecret = String(process.env.NETLAS_ENCRYPTION_KEY ?? "").trim();
  const baseUrl = (String(process.env.NETLAS_BASE_URL ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const query =
    String(process.env.NETLAS_VALIDATION_QUERY ?? "").trim() ||
    String(process.env.NETLAS_QUERY ?? "").trim() ||
    "port:18789";
  const timeoutMs = asInt(process.env.NETLAS_TIMEOUT_MS, 30000);
  const start = asInt(process.env.NETLAS_VALIDATION_START, 0);
  const maxKeys = asInt(options.maxKeys ?? process.env.NETLAS_VALIDATION_MAX_KEYS, 2);
  const runType = String(options.runType ?? "manual").trim() || "manual";

  if (!databaseUrl) throw new Error("Missing required env: DATABASE_URL");
  if (!encryptionSecret) throw new Error("Missing required env: NETLAS_ENCRYPTION_KEY");

  const keys = parseApiKeys().slice(0, maxKeys);
  if (keys.length === 0) throw new Error("Missing Netlas API keys. Set NETLAS_API_KEYS or NETLAS_API_KEY_1/2.");

  const client = new Client({
    connectionString: databaseUrl,
    ssl: /sslmode=require/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    await bootstrapSchema(client);

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

    const perKeyResults = [];
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalInvalid = 0;
    let totalDuplicateInRun = 0;
    let okCount = 0;
    let failedCount = 0;

    for (let i = 0; i < keys.length; i += 1) {
      const apiKey = keys[i];
      const keyId = `k${i + 1}`;
      const encryptedApiKey = encryptApiKey(apiKey, encryptionSecret);

      await upsertKey(client, keyId, apiKey, encryptedApiKey);

      const requestId = randomUUID();
      const result = await callNetlas({ apiKey, baseUrl, query, start, timeoutMs });

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
          keyId,
          SEARCH_PATH,
          query,
          queryHash,
          start,
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

      await bumpUsage(client, keyId, result.status);

      if (result.status === "ok") okCount += 1;
      else failedCount += 1;

      let keyInserted = 0;
      let keyUpdated = 0;
      let keyInvalid = 0;
      let keyDuplicateInRun = 0;
      const seenInRequest = new Set();

      for (let index = 0; index < result.items.length; index += 1) {
        const normalized = normalizeHit(result.items[index], index, query, queryHash);
        if (!normalized.valid) {
          keyInvalid += 1;
          continue;
        }

        const hit = normalized.hit;
        if (seenInRequest.has(hit.hitHash)) {
          keyDuplicateInRun += 1;
          continue;
        }
        seenInRequest.add(hit.hitHash);

        const action = await upsertHitRecord(client, { syncJobId, requestId, keyId, hit });
        if (action === "inserted") keyInserted += 1;
        else keyUpdated += 1;
      }

      totalInserted += keyInserted;
      totalUpdated += keyUpdated;
      totalInvalid += keyInvalid;
      totalDuplicateInRun += keyDuplicateInRun;

      perKeyResults.push({
        keyId,
        status: result.status,
        httpStatus: result.httpStatus,
        inserted: keyInserted,
        updated: keyUpdated,
        invalid: keyInvalid,
        duplicateInRun: keyDuplicateInRun,
        errorCode: result.errorCode,
      });

      if (result.status === "quota_exhausted") {
        await client.query(
          `
            update netlas_keys
            set state = 'quota_exhausted_daily', last_error_code = $2, last_error_message = $3, last_error_at = now(), updated_at = now()
            where key_id = $1
          `,
          [keyId, result.errorCode, result.errorMessage]
        );
      } else if (result.status === "throttled") {
        await client.query(
          `
            update netlas_keys
            set state = 'cooldown', cooldown_until = now() + interval '1 minute', last_error_code = $2, last_error_message = $3, last_error_at = now(), updated_at = now()
            where key_id = $1
          `,
          [keyId, result.errorCode, result.errorMessage]
        );
      } else if (result.status === "ok") {
        await client.query(
          `
            update netlas_keys
            set state = 'healthy', last_success_at = now(), updated_at = now()
            where key_id = $1
          `,
          [keyId]
        );
      }
    }

    const finalStatus = okCount > 0 ? "ok" : "failed";
    const summary = {
      ok_count: okCount,
      failed_count: failedCount,
      inserted: totalInserted,
      updated: totalUpdated,
      invalid_filtered: totalInvalid,
      duplicate_in_run_filtered: totalDuplicateInRun,
      key_results: perKeyResults,
    };

    await client.query(
      `
        update netlas_sync_jobs
        set
          processed_targets = $2,
          pages_fetched = $2,
          total_hits = $3,
          deduped_hits = $4,
          final_status = $5,
          summary = $6,
          finished_at = now()
        where id = $1
      `,
      [syncJobId, keys.length, totalInserted + totalUpdated, totalInserted, finalStatus, summary]
    );

    console.log("Validation finished.");
    console.log(`Sync job id: ${syncJobId}`);
    console.log(`Job key: ${jobId}`);
    console.log(`Keys tested: ${keys.length}`);
    console.log(`Inserted: ${totalInserted}, Updated(existing): ${totalUpdated}`);
    console.log(`Invalid filtered: ${totalInvalid}, Duplicate-in-run filtered: ${totalDuplicateInRun}`);
    console.table(perKeyResults);

    return {
      syncJobId,
      jobId,
      runType,
      keysTested: keys.length,
      inserted: totalInserted,
      updated: totalUpdated,
      invalidFiltered: totalInvalid,
      duplicateInRunFiltered: totalDuplicateInRun,
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
