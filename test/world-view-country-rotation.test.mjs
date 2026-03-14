import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveWorldViewCountryRotation,
  selectWorldViewCountryPoints,
} from "../lib/world-view-country-rotation.mjs";

test("selectWorldViewCountryPoints keeps one active point per country", () => {
  const points = [
    { ip: "1.1.1.1", country: "United States" },
    { ip: "1.1.1.2", country: "United States" },
    { ip: "2.2.2.2", country: "Japan" },
    { ip: "2.2.2.3", country: "Japan" },
    { ip: "3.3.3.3", country: "Germany" },
  ];

  const activePoints = selectWorldViewCountryPoints(points, 0);

  assert.deepEqual([...new Set(activePoints.map(({ countryKey }) => countryKey))], ["Germany", "Japan", "United States"]);
  assert.ok(activePoints.every(({ transition }) => transition.visibility >= 0));
  assert.ok(activePoints.every(({ countryKey }) => activePoints.filter((entry) => entry.countryKey === countryKey).length === 1));
});

test("resolveWorldViewCountryRotation advances to a different index after one cycle", () => {
  const initial = resolveWorldViewCountryRotation({
    countryKey: "United States",
    pointCount: 4,
    nowMs: 0,
  });
  const advanced = resolveWorldViewCountryRotation({
    countryKey: "United States",
    pointCount: 4,
    nowMs: initial.cycleMs,
  });

  assert.notEqual(advanced.index, initial.index);
});

test("resolveWorldViewCountryRotation covers every point before repeating within a round", () => {
  const initial = resolveWorldViewCountryRotation({
    countryKey: "United States",
    pointCount: 5,
    nowMs: 0,
  });
  const visitedIndexes = [];

  for (let offset = 0; offset < 5; offset += 1) {
    const rotation = resolveWorldViewCountryRotation({
      countryKey: "United States",
      pointCount: 5,
      nowMs: offset * initial.cycleMs,
    });
    visitedIndexes.push(rotation.index);
  }

  assert.deepEqual(
    visitedIndexes,
    Array.from({ length: 5 }, (_, index) => (initial.index + index) % 5)
  );
});

test("single-instance countries stay pinned to their only point", () => {
  const initial = resolveWorldViewCountryRotation({
    countryKey: "Iceland",
    pointCount: 1,
    nowMs: 0,
  });
  const later = resolveWorldViewCountryRotation({
    countryKey: "Iceland",
    pointCount: 1,
    nowMs: 60_000,
  });

  assert.equal(initial.index, 0);
  assert.equal(later.index, 0);
});

test("selectWorldViewCountryPoints fades one point out before the next point fades in", () => {
  const rotation = resolveWorldViewCountryRotation({
    countryKey: "United States",
    pointCount: 3,
    nowMs: 0,
  });
  const points = [
    { ip: "1.1.1.1", country: "United States" },
    { ip: "1.1.1.2", country: "United States" },
    { ip: "1.1.1.3", country: "United States" },
  ];
  const fadeOutNowMs = (rotation.cycleMs - rotation.phaseMs - 12 + rotation.cycleMs) % rotation.cycleMs;
  const fadeInNowMs = (rotation.cycleMs - rotation.phaseMs + 12) % rotation.cycleMs;
  const fadingOut = selectWorldViewCountryPoints(points, fadeOutNowMs);
  const fadingIn = selectWorldViewCountryPoints(points, fadeInNowMs);

  assert.equal(fadingOut.length, 1);
  assert.equal(fadingIn.length, 1);
  assert.equal(fadingOut[0]?.transition.phase, "outgoing");
  assert.equal(fadingIn[0]?.transition.phase, "incoming");
  assert.ok((fadingOut[0]?.transition.visibility ?? 0) < 1);
  assert.ok((fadingIn[0]?.transition.visibility ?? 0) < 1);
  assert.notEqual(fadingOut[0]?.point.ip, fadingIn[0]?.point.ip);
});

test("selectWorldViewCountryPoints returns a fully hidden frame at the handoff boundary", () => {
  const rotation = resolveWorldViewCountryRotation({
    countryKey: "United States",
    pointCount: 3,
    nowMs: 0,
  });
  const boundaryNowMs = (rotation.cycleMs - rotation.phaseMs) % rotation.cycleMs;
  const activePoints = selectWorldViewCountryPoints(
    [
      { ip: "1.1.1.1", country: "United States" },
      { ip: "1.1.1.2", country: "United States" },
      { ip: "1.1.1.3", country: "United States" },
    ],
    boundaryNowMs
  );

  assert.equal(activePoints.length, 1);
  assert.equal(activePoints[0]?.transition.phase, "incoming");
  assert.equal(activePoints[0]?.transition.visibility, 0);
});
