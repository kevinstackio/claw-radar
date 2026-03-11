import { flattenRuntimeDictionary, normalizeDictionaryPath, runtimeDict } from "./runtime-dictionary.mjs";

const DICTIONARY_TABLE = "app_dictionary";
const VALUE_TYPES = new Set(["string", "number", "boolean", "json"]);

function inferValueType(value) {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "json";
}

function normalizeNamespace(path) {
  const normalized = normalizeDictionaryPath(path);
  return normalized.includes(".") ? normalized.split(".")[0] : "global";
}

function toStoredValue(value, valueType) {
  if (valueType === "number") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid number dictionary value: ${value}`);
    }
    return parsed;
  }

  if (valueType === "boolean") {
    if (typeof value === "boolean") return value;
    const text = String(value ?? "").trim().toLowerCase();
    if (text === "true" || text === "1") return true;
    if (text === "false" || text === "0") return false;
    throw new Error(`Invalid boolean dictionary value: ${value}`);
  }

  if (valueType === "string") {
    return String(value ?? "");
  }

  return value;
}

function coerceDictionaryValue(rawValue, valueType, fallback) {
  try {
    return toStoredValue(rawValue, valueType);
  } catch {
    return fallback;
  }
}

export async function ensureDictionaryTable(client) {
  await client.query(`
    create table if not exists ${DICTIONARY_TABLE} (
      id uuid primary key default gen_random_uuid(),
      dict_path text not null unique,
      namespace text not null,
      value_type text not null default 'string',
      value jsonb not null,
      description text,
      is_active boolean not null default true,
      updated_by text not null default 'system',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await client.query(`
    create index if not exists idx_app_dictionary_namespace_active
      on ${DICTIONARY_TABLE} (namespace, is_active)
  `);
}

export async function seedRuntimeDictionary(client) {
  await ensureDictionaryTable(client);
  const defaults = flattenRuntimeDictionary();

  for (const entry of defaults) {
    const path = normalizeDictionaryPath(entry.path);
    const valueType = inferValueType(entry.value);
    const stored = toStoredValue(entry.value, valueType);
    const namespace = normalizeNamespace(path);

    await client.query(
      `
        insert into ${DICTIONARY_TABLE} (
          dict_path, namespace, value_type, value, description, is_active, updated_by, updated_at
        )
        values ($1, $2, $3, $4::jsonb, $5, true, 'system_seed', now())
        on conflict (dict_path)
        do nothing
      `,
      [path, namespace, valueType, JSON.stringify(stored), `Seeded from runtime dictionary: ${path}`]
    );
  }
}

export async function getDictionaryEntry(client, path) {
  const dictPath = normalizeDictionaryPath(path);
  if (!dictPath) return null;

  const result = await client.query(
    `
      select dict_path, namespace, value_type, value, description, is_active, updated_by, updated_at
      from ${DICTIONARY_TABLE}
      where dict_path = $1 and is_active = true
      limit 1
    `,
    [dictPath]
  );

  return result.rowCount > 0 ? result.rows[0] : null;
}

export async function getDictionaryValue(client, path, fallback = undefined) {
  const entry = await getDictionaryEntry(client, path);
  if (!entry) {
    const runtimeValue = runtimeDict(path, undefined);
    return runtimeValue === undefined ? fallback : runtimeValue;
  }
  return coerceDictionaryValue(entry.value, entry.value_type, fallback);
}

export async function getDictionaryString(client, path, fallback = "") {
  const value = await getDictionaryValue(client, path, fallback);
  return String(value ?? fallback);
}

export async function getDictionaryNumber(client, path, fallback = 0) {
  const value = await getDictionaryValue(client, path, fallback);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getDictionaryBoolean(client, path, fallback = false) {
  const value = await getDictionaryValue(client, path, fallback);
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "true" || text === "1") return true;
  if (text === "false" || text === "0") return false;
  return fallback;
}

export async function getDictionaryJson(client, path, fallback = null) {
  const value = await getDictionaryValue(client, path, fallback);
  if (value && typeof value === "object") return value;
  return fallback;
}

export async function upsertDictionaryValue(client, payload) {
  const path = normalizeDictionaryPath(payload.path);
  if (!path) throw new Error("Dictionary path is required.");

  const valueType = VALUE_TYPES.has(payload.valueType) ? payload.valueType : inferValueType(payload.value);
  const stored = toStoredValue(payload.value, valueType);
  const namespace = normalizeNamespace(path);
  const description = String(payload.description ?? "").trim() || null;
  const updatedBy = String(payload.updatedBy ?? "system").trim() || "system";
  const isActive = payload.isActive !== false;

  await client.query(
    `
      insert into ${DICTIONARY_TABLE} (
        dict_path, namespace, value_type, value, description, is_active, updated_by, updated_at
      )
      values ($1, $2, $3, $4::jsonb, $5, $6, $7, now())
      on conflict (dict_path)
      do update set
        namespace = excluded.namespace,
        value_type = excluded.value_type,
        value = excluded.value,
        description = excluded.description,
        is_active = excluded.is_active,
        updated_by = excluded.updated_by,
        updated_at = now()
    `,
    [path, namespace, valueType, JSON.stringify(stored), description, isActive, updatedBy]
  );

  return {
    path,
    namespace,
    valueType,
    value: stored,
    isActive,
    updatedBy,
  };
}
