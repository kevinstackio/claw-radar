function normalizeText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function mergeIntegerArrays(left = [], right = []) {
  return [...new Set([...left, ...right].filter((value) => Number.isInteger(value) && value > 0 && value <= 65535))].sort(
    (a, b) => a - b
  );
}

function mergeTextArrays(left = [], right = []) {
  return [...new Set([...left, ...right].map((value) => normalizeText(value)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function preferText(existingValue, incomingValue, { ignoreIncoming = [] } = {}) {
  const existing = normalizeText(existingValue);
  const incoming = normalizeText(incomingValue);

  if (incoming && !ignoreIncoming.includes(incoming)) {
    return incoming;
  }

  return existing;
}

function hasCoordinatePair(record) {
  return typeof record?.latitude === "number" && typeof record?.longitude === "number";
}

export function mergeInstanceObservations(existing, incoming) {
  return {
    ...existing,
    query: incoming.query ?? existing.query ?? null,
    queryHash: incoming.queryHash ?? existing.queryHash ?? null,
    ip: incoming.ip ?? existing.ip,
    ports: mergeIntegerArrays(existing.ports, incoming.ports),
    transports: mergeTextArrays(existing.transports, incoming.transports),
    protocols: mergeTextArrays(existing.protocols, incoming.protocols),
    netlasItemIds: mergeTextArrays(existing.netlasItemIds, incoming.netlasItemIds),
    country: preferText(existing.country, incoming.country, { ignoreIncoming: ["Unknown"] }) ?? "Unknown",
    countryCode: preferText(existing.countryCode, incoming.countryCode),
    city: preferText(existing.city, incoming.city),
    latitude: hasCoordinatePair(incoming) ? incoming.latitude : existing.latitude,
    longitude: hasCoordinatePair(incoming) ? incoming.longitude : existing.longitude,
    isp: preferText(existing.isp, incoming.isp),
    asnName: preferText(existing.asnName, incoming.asnName),
    asnNumber: preferText(existing.asnNumber, incoming.asnNumber),
    organization: preferText(existing.organization, incoming.organization),
  };
}
