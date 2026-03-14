import assert from "node:assert/strict";
import test from "node:test";

import {
  computeRemainingHourlyRuns,
  computeUsageDelta,
  createRunDeduper,
  planRequestsForRun,
  resolveNextStartOffset,
} from "../lib/server/netlas-sync-core.mjs";

test("computeUsageDelta counts any provider HTTP response as consumed request", () => {
  assert.deepEqual(computeUsageDelta({ status: "ok", httpStatus: 200 }), {
    usedRequests: 1,
    unknownPending: 0,
  });

  assert.deepEqual(computeUsageDelta({ status: "quota_exhausted", httpStatus: 402 }), {
    usedRequests: 1,
    unknownPending: 0,
  });

  assert.deepEqual(computeUsageDelta({ status: "upstream_error", httpStatus: 500 }), {
    usedRequests: 1,
    unknownPending: 0,
  });
});

test("computeUsageDelta keeps unknown/timeouts without provider response in pending bucket", () => {
  assert.deepEqual(computeUsageDelta({ status: "unknown", httpStatus: null }), {
    usedRequests: 0,
    unknownPending: 1,
  });

  assert.deepEqual(computeUsageDelta({ status: "timeout", httpStatus: null }), {
    usedRequests: 0,
    unknownPending: 1,
  });
});

test("planRequestsForRun balances total budget and max pages", () => {
  assert.deepEqual(planRequestsForRun({ totalRemainingBudget: 0, remainingRunsToday: 12, maxPages: 10 }), {
    targetRequestsThisRun: 0,
    plannedRequestsThisRun: 0,
  });

  assert.deepEqual(planRequestsForRun({ totalRemainingBudget: 100, remainingRunsToday: 10, maxPages: 5 }), {
    targetRequestsThisRun: 10,
    plannedRequestsThisRun: 5,
  });

  assert.deepEqual(planRequestsForRun({ totalRemainingBudget: 5, remainingRunsToday: 2, maxPages: 10 }), {
    targetRequestsThisRun: 3,
    plannedRequestsThisRun: 3,
  });
});

test("computeRemainingHourlyRuns is bounded in [1, 24]", () => {
  assert.equal(computeRemainingHourlyRuns(new Date(Date.UTC(2026, 2, 12, 0, 0, 0))), 24);
  assert.equal(computeRemainingHourlyRuns(new Date(Date.UTC(2026, 2, 12, 23, 59, 0))), 1);
});

test("createRunDeduper filters cross-page duplicates in same run", () => {
  const deduper = createRunDeduper();
  assert.equal(deduper.addIfNew("hash-a"), true);
  assert.equal(deduper.addIfNew("hash-a"), false);
  assert.equal(deduper.addIfNew("hash-b"), true);
  assert.equal(deduper.size(), 2);
});

test("resolveNextStartOffset advances cursor after successful paged runs", () => {
  assert.equal(
    resolveNextStartOffset({
      currentStartOffset: 60,
      nextStartOffset: 120,
      successfulRequests: 3,
      stopReason: "max_requests_planned",
    }),
    120
  );
});

test("resolveNextStartOffset wraps to zero when run reaches the last page", () => {
  assert.equal(
    resolveNextStartOffset({
      currentStartOffset: 60,
      nextStartOffset: 80,
      successfulRequests: 1,
      stopReason: "last_page_short",
    }),
    0
  );
});

test("resolveNextStartOffset keeps the current cursor when no page succeeded", () => {
  assert.equal(
    resolveNextStartOffset({
      currentStartOffset: 60,
      nextStartOffset: 80,
      successfulRequests: 0,
      stopReason: "no_available_key",
    }),
    60
  );
});
