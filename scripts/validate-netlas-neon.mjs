#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  getDictionaryNumber,
  seedRuntimeDictionary,
  upsertDictionaryValue,
} from "../lib/server/dictionary-store.mjs";
import {
  computeRemainingHourlyRuns,
  computeUsageDelta,
  createRunDeduper,
  planRequestsForRun,
  resolveNextStartOffset,
} from "../lib/server/netlas-sync-core.mjs";
import { mergeInstanceObservations } from "../lib/server/netlas-instance-sync.mjs";

const DEFAULT_BASE_URL = "https://app.netlas.io";
const DEFAULT_OPENCLAW_QUERY = "(http.title:\"OpenClaw Control\") OR (http.body:\"openclaw-app\") OR (http.body:\"__OPENCLAW_CONTROL_UI_BASE_PATH__\")";
const SEARCH_PATH = "/api/responses/";
const DICT_INITIAL_START_OFFSET = "netlas.validation.initial_start_offset";
const DICT_NEXT_START_OFFSET = "netlas.validation.next_start_offset";
const SCHEDULED_SYNC_LOCK_KEY = 42024001;

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

function normalizeOptionalText(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeNetlasObservation(item, query, queryHash) {
  const data = item && typeof item === "object" && item.data && typeof item.data === "object" ? item.data : item;

  const ip = normalizeIp(String(pick(data, ["ip"]) ?? pick(item, ["ip"]) ?? ""));
  const port = toPort(pick(data, ["port"]) ?? pick(item, ["port"]));
  const country = String(pick(data, ["geo", "country"]) ?? pick(data, ["country"]) ?? "Unknown").trim() || "Unknown";
  const countryCode = normalizeOptionalText(pick(data, ["geo", "country_code"]));
  const city = normalizeOptionalText(pick(data, ["geo", "city"]));
  const latitude = toNumber(pick(data, ["geo", "location", "lat"]) ?? pick(data, ["latitude"]));
  const longitude = toNumber(pick(data, ["geo", "location", "lon"]) ?? pick(data, ["longitude"]));
  const transport = normalizeOptionalText(pick(data, ["transport"]));
  const protocol = normalizeOptionalText(pick(data, ["protocol"]) ?? pick(data, ["service", "protocol"]));
  const netlasItemId = normalizeOptionalText(pick(data, ["_id"]) ?? pick(item, ["_id"]) ?? pick(item, ["id"]));
  const isp = normalizeOptionalText(pick(data, ["isp"]));
  const asnName = normalizeOptionalText(pick(data, ["whois", "asn", "name"]));
  const asnNumber = normalizeOptionalText(pick(data, ["whois", "asn", "number"]));
  const organization = normalizeOptionalText(pick(data, ["whois", "net", "organization"]));

  if (!ip || !isPublicIp(ip)) return { valid: false, reason: "invalid_or_non_public_ip" };
  if (latitude === null || longitude === null || !isValidCoordinate(latitude, longitude)) {
    return { valid: false, reason: "invalid_coordinates" };
  }

  const protocolNorm = protocol ? protocol.toLowerCase() : null;
  const transportNorm = transport ? transport.toLowerCase() : null;
  const serviceKey = sha256(`netlas|${ip}|${port ?? 0}|${protocolNorm ?? ""}|${transportNorm ?? ""}|${netlasItemId ?? ""}`);

  return {
    valid: true,
    observation: {
      query,
      queryHash,
      ip,
      ports: port === null ? [] : [port],
      transports: transportNorm ? [transportNorm] : [],
      protocols: protocolNorm ? [protocolNorm] : [],
      netlasItemIds: netlasItemId ? [netlasItemId] : [],
      country,
      countryCode,
      city,
      latitude,
      longitude,
      isp,
      asnName,
      asnNumber,
      organization,
      serviceKey,
    },
  };
}

async function bootstrapSchema(client) {
  const schemaSql = await readFile(new URL("../docs/NEON-SCHEMA.sql", import.meta.url), "utf8");
  await client.query(schemaSql);
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `
      select to_regclass($1) as regclass
    `,
    [`public.${tableName}`]
  );

  return Boolean(result.rows[0]?.regclass);
}

async function migrateLegacyHitsTable(client) {
  if (!(await tableExists(client, "netlas_hits"))) {
    return false;
  }

  await client.query("begin");

  try {
    await client.query(`
      insert into netlas_instances (
        sync_job_id,
        request_id,
        key_id,
        provider,
        query,
        query_hash,
        ip,
        ports,
        transports,
        protocols,
        netlas_item_ids,
        country,
        country_code,
        city,
        latitude,
        longitude,
        isp,
        asn_name,
        asn_number,
        organization,
        first_seen_at,
        last_seen_at,
        created_at
      )
      select
        (array_remove(array_agg(sync_job_id order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as sync_job_id,
        (array_remove(array_agg(request_id order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as request_id,
        (array_remove(array_agg(key_id order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as key_id,
        coalesce((array_remove(array_agg(nullif(provider, '') order by last_seen_at desc nulls last, created_at desc nulls last), null))[1], 'netlas') as provider,
        (array_remove(array_agg(nullif(query, '') order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as query,
        (array_remove(array_agg(nullif(query_hash, '') order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as query_hash,
        ip,
        coalesce(array_remove(array_agg(distinct port order by port), null), '{}'::integer[]) as ports,
        coalesce(array_remove(array_agg(distinct nullif(lower(transport), '') order by nullif(lower(transport), '')), null), '{}'::text[]) as transports,
        coalesce(array_remove(array_agg(distinct nullif(lower(protocol), '') order by nullif(lower(protocol), '')), null), '{}'::text[]) as protocols,
        coalesce(array_remove(array_agg(distinct nullif(netlas_item_id, '') order by nullif(netlas_item_id, '')), null), '{}'::text[]) as netlas_item_ids,
        coalesce(
          (array_remove(array_agg(case when nullif(country, '') is not null and country <> 'Unknown' then country end order by last_seen_at desc nulls last, created_at desc nulls last), null))[1],
          (array_remove(array_agg(nullif(country, '') order by last_seen_at desc nulls last, created_at desc nulls last), null))[1],
          'Unknown'
        ) as country,
        (array_remove(array_agg(nullif(country_code, '') order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as country_code,
        (array_remove(array_agg(nullif(city, '') order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as city,
        (array_remove(array_agg(latitude order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as latitude,
        (array_remove(array_agg(longitude order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as longitude,
        (array_remove(array_agg(nullif(raw_hit->'data'->>'isp', '') order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as isp,
        (array_remove(array_agg(nullif(raw_hit->'data'->'whois'->'asn'->>'name', '') order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as asn_name,
        (array_remove(array_agg(nullif(raw_hit->'data'->'whois'->'asn'->>'number', '') order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as asn_number,
        (array_remove(array_agg(nullif(raw_hit->'data'->'whois'->'net'->>'organization', '') order by last_seen_at desc nulls last, created_at desc nulls last), null))[1] as organization,
        min(coalesce(first_seen_at, created_at, now())) as first_seen_at,
        max(coalesce(last_seen_at, created_at, now())) as last_seen_at,
        min(coalesce(created_at, now())) as created_at
      from netlas_hits
      where ip is not null
      group by ip
      on conflict (ip)
      do update set
        sync_job_id = excluded.sync_job_id,
        request_id = excluded.request_id,
        key_id = excluded.key_id,
        provider = excluded.provider,
        query = excluded.query,
        query_hash = excluded.query_hash,
        ports = (
          select coalesce(array_agg(distinct port_value order by port_value), '{}'::integer[])
          from unnest(coalesce(netlas_instances.ports, '{}'::integer[]) || coalesce(excluded.ports, '{}'::integer[])) as port_value
        ),
        transports = (
          select coalesce(array_agg(distinct transport_value order by transport_value), '{}'::text[])
          from unnest(coalesce(netlas_instances.transports, '{}'::text[]) || coalesce(excluded.transports, '{}'::text[])) as transport_value
          where transport_value is not null and transport_value <> ''
        ),
        protocols = (
          select coalesce(array_agg(distinct protocol_value order by protocol_value), '{}'::text[])
          from unnest(coalesce(netlas_instances.protocols, '{}'::text[]) || coalesce(excluded.protocols, '{}'::text[])) as protocol_value
          where protocol_value is not null and protocol_value <> ''
        ),
        netlas_item_ids = (
          select coalesce(array_agg(distinct item_id order by item_id), '{}'::text[])
          from unnest(coalesce(netlas_instances.netlas_item_ids, '{}'::text[]) || coalesce(excluded.netlas_item_ids, '{}'::text[])) as item_id
          where item_id is not null and item_id <> ''
        ),
        country = case
          when excluded.country is not null and excluded.country <> '' and excluded.country <> 'Unknown' then excluded.country
          when netlas_instances.country is not null and netlas_instances.country <> '' then netlas_instances.country
          else coalesce(nullif(excluded.country, ''), nullif(netlas_instances.country, ''), 'Unknown')
        end,
        country_code = coalesce(nullif(excluded.country_code, ''), netlas_instances.country_code),
        city = coalesce(nullif(excluded.city, ''), netlas_instances.city),
        latitude = case
          when excluded.latitude is not null and excluded.longitude is not null then excluded.latitude
          else netlas_instances.latitude
        end,
        longitude = case
          when excluded.latitude is not null and excluded.longitude is not null then excluded.longitude
          else netlas_instances.longitude
        end,
        isp = coalesce(nullif(excluded.isp, ''), netlas_instances.isp),
        asn_name = coalesce(nullif(excluded.asn_name, ''), netlas_instances.asn_name),
        asn_number = coalesce(nullif(excluded.asn_number, ''), netlas_instances.asn_number),
        organization = coalesce(nullif(excluded.organization, ''), netlas_instances.organization),
        first_seen_at = least(netlas_instances.first_seen_at, excluded.first_seen_at),
        last_seen_at = greatest(netlas_instances.last_seen_at, excluded.last_seen_at)
    `);

    await client.query(`drop table if exists netlas_hits`);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function resolveKeyIdentity(client, apiKey) {
  const fingerprint = sha256(apiKey).slice(0, 16);
  const existing = await client.query(
    `
      select key_id
      from netlas_keys
      where key_fingerprint = $1
      limit 1
    `,
    [fingerprint]
  );

  if (existing.rowCount > 0) {
    return {
      keyId: String(existing.rows[0].key_id),
      fingerprint,
    };
  }

  return {
    keyId: `kf_${fingerprint}`,
    fingerprint,
  };
}

async function upsertKey(client, keyId, fingerprint, encryptedApiKey) {
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

async function bumpUsage(client, keyId, usageDelta) {
  const usageDate = toIsoDate();
  const usageMonth = toMonthDate();
  const requestsInc = Math.max(0, asInt(usageDelta?.usedRequests, 0));
  const unknownInc = Math.max(0, asInt(usageDelta?.unknownPending, 0));

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

async function upsertInstanceRecord(client, { syncJobId, requestId, keyId, observation }) {
  const result = await client.query(
    `
      insert into netlas_instances (
        sync_job_id,
        request_id,
        key_id,
        provider,
        query,
        query_hash,
        ip,
        ports,
        transports,
        protocols,
        netlas_item_ids,
        country,
        country_code,
        city,
        latitude,
        longitude,
        first_seen_at,
        last_seen_at,
        isp,
        asn_name,
        asn_number,
        organization
      )
      values (
        $1, $2, $3, 'netlas', $4, $5, $6::inet, $7::integer[], $8::text[], $9::text[], $10::text[],
        $11, $12, $13, $14, $15, now(), now(), $16, $17, $18, $19
      )
      on conflict (ip)
      do update set
        sync_job_id = excluded.sync_job_id,
        request_id = excluded.request_id,
        key_id = excluded.key_id,
        provider = excluded.provider,
        query = excluded.query,
        query_hash = excluded.query_hash,
        ports = (
          select coalesce(array_agg(distinct port_value order by port_value), '{}'::integer[])
          from unnest(coalesce(netlas_instances.ports, '{}'::integer[]) || coalesce(excluded.ports, '{}'::integer[])) as port_value
        ),
        transports = (
          select coalesce(array_agg(distinct transport_value order by transport_value), '{}'::text[])
          from unnest(coalesce(netlas_instances.transports, '{}'::text[]) || coalesce(excluded.transports, '{}'::text[])) as transport_value
          where transport_value is not null and transport_value <> ''
        ),
        protocols = (
          select coalesce(array_agg(distinct protocol_value order by protocol_value), '{}'::text[])
          from unnest(coalesce(netlas_instances.protocols, '{}'::text[]) || coalesce(excluded.protocols, '{}'::text[])) as protocol_value
          where protocol_value is not null and protocol_value <> ''
        ),
        netlas_item_ids = (
          select coalesce(array_agg(distinct item_id order by item_id), '{}'::text[])
          from unnest(coalesce(netlas_instances.netlas_item_ids, '{}'::text[]) || coalesce(excluded.netlas_item_ids, '{}'::text[])) as item_id
          where item_id is not null and item_id <> ''
        ),
        country = case
          when excluded.country is not null and excluded.country <> '' and excluded.country <> 'Unknown' then excluded.country
          when netlas_instances.country is not null and netlas_instances.country <> '' then netlas_instances.country
          else coalesce(nullif(excluded.country, ''), nullif(netlas_instances.country, ''), 'Unknown')
        end,
        country_code = coalesce(nullif(excluded.country_code, ''), netlas_instances.country_code),
        city = coalesce(nullif(excluded.city, ''), netlas_instances.city),
        latitude = case
          when excluded.latitude is not null and excluded.longitude is not null then excluded.latitude
          else netlas_instances.latitude
        end,
        longitude = case
          when excluded.latitude is not null and excluded.longitude is not null then excluded.longitude
          else netlas_instances.longitude
        end,
        last_seen_at = greatest(netlas_instances.last_seen_at, excluded.last_seen_at),
        isp = coalesce(nullif(excluded.isp, ''), netlas_instances.isp),
        asn_name = coalesce(nullif(excluded.asn_name, ''), netlas_instances.asn_name),
        asn_number = coalesce(nullif(excluded.asn_number, ''), netlas_instances.asn_number),
        organization = coalesce(nullif(excluded.organization, ''), netlas_instances.organization)
      returning (xmax = 0) as inserted
    `,
    [
      syncJobId,
      requestId,
      keyId,
      observation.query,
      observation.queryHash,
      observation.ip,
      observation.ports,
      observation.transports,
      observation.protocols,
      observation.netlasItemIds,
      observation.country,
      observation.countryCode,
      observation.city,
      observation.latitude,
      observation.longitude,
      observation.isp,
      observation.asnName,
      observation.asnNumber,
      observation.organization,
    ]
  );

  if (result.rowCount === 0) {
    throw new Error(`Failed to upsert netlas instance for IP ${observation.ip}.`);
  }

  return result.rows[0]?.inserted ? "inserted" : "updated";
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

async function resolveScheduledStartOffset(client, { configuredStartOffset, maxPages, startStep }) {
  const initialFallback = Math.max(configuredStartOffset, maxPages * startStep);
  const initialStartOffset = Math.max(
    0,
    asInt(await getDictionaryNumber(client, DICT_INITIAL_START_OFFSET, initialFallback), initialFallback)
  );

  return Math.max(0, asInt(await getDictionaryNumber(client, DICT_NEXT_START_OFFSET, initialStartOffset), initialStartOffset));
}

async function persistScheduledStartOffset(client, nextStartOffset, updatedBy) {
  await upsertDictionaryValue(client, {
    path: DICT_NEXT_START_OFFSET,
    valueType: "number",
    value: Math.max(0, asInt(nextStartOffset, 0)),
    description: "Next Netlas response start offset for scheduled instance sync.",
    updatedBy,
  });
}

async function tryAcquireScheduledSyncLock(client) {
  const result = await client.query(
    `
      select pg_try_advisory_lock($1) as locked
    `,
    [SCHEDULED_SYNC_LOCK_KEY]
  );

  return result.rows[0]?.locked === true;
}

async function releaseScheduledSyncLock(client) {
  await client.query(
    `
      select pg_advisory_unlock($1)
    `,
    [SCHEDULED_SYNC_LOCK_KEY]
  );
}

export async function migrateNetlasInstanceSchema() {
  const databaseUrl = String(process.env.DATABASE_URL ?? "").trim();
  if (!databaseUrl) throw new Error("Missing required env: DATABASE_URL");

  const client = new Client({
    connectionString: databaseUrl,
    ssl: /sslmode=require/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    await bootstrapSchema(client);
    const migratedLegacyHits = await migrateLegacyHitsTable(client);
    return { migratedLegacyHits };
  } finally {
    await client.end();
  }
}

export async function runNetlasValidation(options = {}) {
  const databaseUrl = String(process.env.DATABASE_URL ?? "").trim();
  const baseUrl = (String(process.env.NETLAS_BASE_URL ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const query = String(process.env.NETLAS_QUERY ?? "").trim() || DEFAULT_OPENCLAW_QUERY;
  const timeoutMs = asInt(options.timeoutMs ?? process.env.NETLAS_TIMEOUT_MS, 30000);
  const configuredStartOffset = asInt(process.env.NETLAS_VALIDATION_START, 0);
  const startStep = asInt(process.env.NETLAS_VALIDATION_START_STEP ?? process.env.NETLAS_START_STEP, 20);
  const maxPages = asInt(options.maxPages ?? process.env.NETLAS_VALIDATION_MAX_PAGES ?? process.env.NETLAS_MAX_PAGES, 10);
  const dailyRequestBudgetPerKey = asInt(process.env.NETLAS_DAILY_REQUEST_BUDGET_PER_KEY, 50);
  const requestedMaxKeys = parseOptionalInt(options.maxKeys ?? process.env.NETLAS_VALIDATION_MAX_KEYS);
  const requestedStartOffset = parseOptionalInt(options.startOffset);
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
  let scheduledLockAcquired = false;

  await client.connect();

  try {
    await bootstrapSchema(client);
    await migrateLegacyHitsTable(client);
    await seedRuntimeDictionary(client);

    if (runType === "scheduled") {
      scheduledLockAcquired = await tryAcquireScheduledSyncLock(client);
      if (!scheduledLockAcquired) {
        return {
          syncJobId: null,
          jobId: null,
          runType,
          skipped: true,
          skipReason: "scheduled_sync_already_running",
          message: "Another scheduled sync is already running. This run was skipped to protect the shared cursor.",
        };
      }
    }

    const encryptionSecret = String(process.env.NETLAS_ENCRYPTION_KEY ?? "").trim();
    if (!encryptionSecret) {
      throw new Error("Missing required env: NETLAS_ENCRYPTION_KEY");
    }

    const allKeys = parseApiKeys();
    if (allKeys.length === 0) {
      throw new Error("Missing Netlas API keys. Set NETLAS_API_KEYS or NETLAS_API_KEY_1/2.");
    }

    const defaultMaxKeys = Math.max(1, asInt(await getDictionaryNumber(client, "netlas.validation.default_max_keys", allKeys.length), allKeys.length));
    const maxKeysLimit = Math.max(defaultMaxKeys, asInt(await getDictionaryNumber(client, "netlas.validation.max_keys_limit", 20), 20));
    const desiredMaxKeys = requestedMaxKeys ?? (runType === "scheduled" ? allKeys.length : defaultMaxKeys);
    const resolvedMaxKeys = Math.min(Math.max(desiredMaxKeys, 1), maxKeysLimit, allKeys.length);
    const startOffset =
      requestedStartOffset ??
      (runType === "scheduled"
        ? await resolveScheduledStartOffset(client, {
            configuredStartOffset,
            maxPages,
            startStep,
          })
        : configuredStartOffset);

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
      const { keyId, fingerprint } = await resolveKeyIdentity(client, apiKey);
      const encryptedApiKey = encryptApiKey(apiKey, encryptionSecret);
      await upsertKey(client, keyId, fingerprint, encryptedApiKey);

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
    const { plannedRequestsThisRun } = planRequestsForRun({
      totalRemainingBudget,
      remainingRunsToday,
      maxPages,
    });

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalInvalid = 0;
    let totalDuplicateInRun = 0;
    let totalPagesFetched = 0;
    let okCount = 0;
    let failedCount = 0;
    let stopReason = plannedRequestsThisRun === 0 ? "no_budget_remaining" : "max_requests_planned";
    let nextStartOffset = startOffset;
    let observedPageSize = null;

    let roundRobinCursor = 0;
    const runDeduper = createRunDeduper();

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
      const usageDelta = computeUsageDelta(result);
      const pageSize = result.status === "ok" ? result.items.length : null;

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
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
            $12, $13, $14, null, $15, $16, $17, $18, $19
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
          pageSize,
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

      await bumpUsage(client, selectedKey.keyId, usageDelta);
      selectedKey.usedToday += usageDelta.usedRequests;
      selectedKey.remainingToday = Math.max(0, selectedKey.remainingToday - usageDelta.usedRequests);

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

      await client.query(
        `
          update netlas_keys
          set state = 'healthy', last_success_at = now(), updated_at = now()
          where key_id = $1
        `,
        [selectedKey.keyId]
      );

      const pageInstances = new Map();

      for (let index = 0; index < result.items.length; index += 1) {
        const normalized = normalizeNetlasObservation(result.items[index], query, queryHash);
        if (!normalized.valid) {
          selectedKey.invalid += 1;
          totalInvalid += 1;
          continue;
        }

        const observation = normalized.observation;
        if (!runDeduper.addIfNew(observation.serviceKey)) {
          selectedKey.duplicateInRun += 1;
          totalDuplicateInRun += 1;
          continue;
        }

        const existingObservation = pageInstances.get(observation.ip);
        pageInstances.set(
          observation.ip,
          existingObservation ? mergeInstanceObservations(existingObservation, observation) : observation
        );
      }

      for (const observation of pageInstances.values()) {
        const action = await upsertInstanceRecord(client, {
          syncJobId,
          requestId,
          keyId: selectedKey.keyId,
          observation,
        });
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
    const resolvedNextStartOffset =
      runType === "scheduled"
        ? resolveNextStartOffset({
            currentStartOffset: startOffset,
            nextStartOffset,
            successfulRequests: okCount,
            stopReason,
          })
        : nextStartOffset;
    const summary = {
      ok_count: okCount,
      failed_count: failedCount,
      pages_fetched: totalPagesFetched,
      planned_requests: plannedRequestsThisRun,
      remaining_runs_today: remainingRunsToday,
      total_remaining_budget: totalRemainingBudget,
      per_key_daily_budget: dailyRequestBudgetPerKey,
      observed_page_size: observedPageSize,
      start_offset_used: startOffset,
      next_start_offset: resolvedNextStartOffset,
      inserted: totalInserted,
      updated: totalUpdated,
      invalid_filtered: totalInvalid,
      duplicate_in_run_filtered: totalDuplicateInRun,
      stop_reason: stopReason,
      key_results: perKeyResults,
    };

    if (runType === "scheduled") {
      await persistScheduledStartOffset(client, resolvedNextStartOffset, jobId);
    }

    await client.query(
      `
        update netlas_sync_jobs
        set
          processed_targets = $2,
          pages_fetched = $3,
          final_status = $4,
          summary = $5,
          finished_at = now()
        where id = $1
      `,
      [syncJobId, keys.length, totalPagesFetched, finalStatus, summary]
    );

    console.log("Validation finished.");
    console.log(`Sync job id: ${syncJobId}`);
    console.log(`Job key: ${jobId}`);
    console.log(`Keys in pool: ${keys.length}`);
    console.log(`Planned requests this run: ${plannedRequestsThisRun}`);
    console.log(`Start offset used: ${startOffset}, Next start offset: ${resolvedNextStartOffset}`);
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
      startOffsetUsed: startOffset,
      nextStartOffset: resolvedNextStartOffset,
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
    if (scheduledLockAcquired) {
      await releaseScheduledSyncLock(client).catch(() => {});
    }
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
