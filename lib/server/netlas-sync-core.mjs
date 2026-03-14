function toPositiveInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

export function computeRemainingHourlyRuns(now = new Date()) {
  const currentHourUtc = now.getUTCHours();
  return Math.max(1, 24 - currentHourUtc);
}

export function planRequestsForRun({ totalRemainingBudget, remainingRunsToday, maxPages }) {
  const safeTotalBudget = toPositiveInt(totalRemainingBudget, 0);
  const safeRemainingRuns = Math.max(1, toPositiveInt(remainingRunsToday, 1));
  const safeMaxPages = toPositiveInt(maxPages, 0);

  const targetRequestsThisRun =
    safeTotalBudget > 0 ? Math.max(1, Math.ceil(safeTotalBudget / safeRemainingRuns)) : 0;
  const plannedRequestsThisRun = Math.min(safeMaxPages, targetRequestsThisRun, safeTotalBudget);

  return {
    targetRequestsThisRun,
    plannedRequestsThisRun,
  };
}

export function resolveNextStartOffset({
  currentStartOffset,
  nextStartOffset,
  successfulRequests,
  stopReason,
}) {
  const current = toPositiveInt(currentStartOffset, 0);
  const next = toPositiveInt(nextStartOffset, current);
  const okCount = toPositiveInt(successfulRequests, 0);
  const reason = String(stopReason ?? "").trim().toLowerCase();

  if (okCount === 0) {
    return current;
  }

  if (reason === "empty_page" || reason === "last_page_short") {
    return 0;
  }

  return next;
}

export function computeUsageDelta({ status, httpStatus }) {
  const resolvedStatus = String(status ?? "").trim().toLowerCase();
  const hasProviderResponse = Number.isInteger(httpStatus) && httpStatus > 0;

  return {
    usedRequests: hasProviderResponse ? 1 : 0,
    unknownPending: resolvedStatus === "unknown" || (resolvedStatus === "timeout" && !hasProviderResponse) ? 1 : 0,
  };
}

export function createRunDeduper(initialHashes = []) {
  const seen = new Set(
    Array.isArray(initialHashes)
      ? initialHashes.filter((hash) => typeof hash === "string" && hash.length > 0)
      : []
  );

  return {
    addIfNew(hash) {
      if (typeof hash !== "string" || hash.length === 0) return false;
      if (seen.has(hash)) return false;
      seen.add(hash);
      return true;
    },
    has(hash) {
      return typeof hash === "string" && hash.length > 0 ? seen.has(hash) : false;
    },
    size() {
      return seen.size;
    },
  };
}
