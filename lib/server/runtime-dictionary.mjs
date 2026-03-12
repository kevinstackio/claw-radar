export const RUNTIME_DICTIONARY = Object.freeze({
  netlas: Object.freeze({
    validation: Object.freeze({
      default_max_keys: 2,
      max_keys_limit: 20,
    }),
    cron: Object.freeze({
      default_max_keys: 2,
      max_keys_limit: 20,
    }),
  }),
});

function readPath(source, path) {
  return String(path)
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), source);
}

function flattenObject(source, prefix = "", target = []) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return target;
  }

  for (const [key, value] of Object.entries(source)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenObject(value, nextPath, target);
    } else {
      target.push({ path: nextPath, value });
    }
  }

  return target;
}

export function runtimeDict(path, fallback = undefined) {
  const value = readPath(RUNTIME_DICTIONARY, path);
  return value === undefined ? fallback : value;
}

export function requiredRuntimeDict(path) {
  const value = readPath(RUNTIME_DICTIONARY, path);
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing dictionary value: ${path}`);
  }
  return value;
}

export function flattenRuntimeDictionary() {
  return flattenObject(RUNTIME_DICTIONARY);
}

export function normalizeDictionaryPath(path) {
  return String(path ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/\/+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
}
