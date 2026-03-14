import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveRegionRotation,
  selectRotatingRegionPoints,
} from "../lib/map-region-rotation.mjs";

test("selectRotatingRegionPoints keeps raw region codes separate", () => {
  const points = [
    { ip: "1.1.1.1", country: "CN", lat: 34.7, lon: 113.7 },
    { ip: "1.1.1.2", country: "CN", lat: 34.7, lon: 113.7 },
    { ip: "2.2.2.2", country: "HK", lat: 22.3, lon: 114.2 },
  ];

  const activePoints = selectRotatingRegionPoints(points, 0);

  assert.deepEqual(
    activePoints.map(({ regionKey }) => regionKey),
    ["CN", "HK"]
  );
});

test("selectRotatingRegionPoints shows one point per region at a time", () => {
  const points = [
    { ip: "1.1.1.1", country: "CN", lat: 34.7, lon: 113.7 },
    { ip: "1.1.1.2", country: "CN", lat: 34.7, lon: 113.7 },
    { ip: "2.2.2.2", country: "HK", lat: 22.3, lon: 114.2 },
    { ip: "3.3.3.3", country: "US", lat: 37.7, lon: -122.4 },
    { ip: "3.3.3.4", country: "US", lat: 40.7, lon: -74.0 },
  ];

  const activePoints = selectRotatingRegionPoints(points, 0);

  assert.equal(activePoints.length, 3);
  assert.ok(activePoints.every(({ point, regionKey }) => point.country === regionKey));
  assert.ok(activePoints.every(({ transition }) => transition.visibility >= 0));
  assert.ok(activePoints.every(({ transition }) => transition.visibility <= 1));
});

test("resolveRegionRotation covers every point before repeating in a round", () => {
  const initial = resolveRegionRotation({
    regionKey: "CN",
    pointCount: 4,
    nowMs: 0,
  });
  const visitedIndexes = [];

  for (let offset = 0; offset < 4; offset += 1) {
    const rotation = resolveRegionRotation({
      regionKey: "CN",
      pointCount: 4,
      nowMs: offset * initial.cycleMs,
    });
    visitedIndexes.push(rotation.index);
  }

  assert.equal(new Set(visitedIndexes).size, 4);
});

test("resolveRegionRotation uses a fixed 5 second cycle with 1 second transitions", () => {
  const rotation = resolveRegionRotation({
    regionKey: "CN",
    pointCount: 4,
    nowMs: 0,
  });

  assert.equal(rotation.cycleMs, 5000);
  assert.equal(rotation.transitionMs, 1000);
});

test("resolveRegionRotation advances to a new randomized round order", () => {
  const initial = resolveRegionRotation({
    regionKey: "US",
    pointCount: 4,
    nowMs: 0,
  });
  const firstRound = [];
  const secondRound = [];

  for (let offset = 0; offset < 4; offset += 1) {
    firstRound.push(
      resolveRegionRotation({
        regionKey: "US",
        pointCount: 4,
        nowMs: offset * initial.cycleMs,
      }).index
    );
    secondRound.push(
      resolveRegionRotation({
        regionKey: "US",
        pointCount: 4,
        nowMs: (offset + 4) * initial.cycleMs,
      }).index
    );
  }

  assert.equal(new Set(secondRound).size, 4);
  assert.notDeepEqual(secondRound, firstRound);
});

test("single-instance regions stay fixed and do not enter a transition", () => {
  const activePoints = selectRotatingRegionPoints(
    [
      { ip: "2.2.2.2", country: "HK", lat: 22.3, lon: 114.2 },
    ],
    999999
  );

  assert.equal(activePoints.length, 1);
  assert.equal(activePoints[0]?.point.ip, "2.2.2.2");
  assert.equal(activePoints[0]?.transition.phase, "steady");
  assert.equal(activePoints[0]?.transition.visibility, 1);
});

test("multi-instance regions fade out before the next point fades in", () => {
  const base = resolveRegionRotation({
    regionKey: "CN",
    pointCount: 3,
    nowMs: 0,
  });
  const outgoingNowMs =
    base.cycleMs - base.phaseMs - Math.floor(base.transitionMs / 2);
  const incomingNowMs =
    base.cycleMs - base.phaseMs + Math.floor(base.transitionMs / 2);
  const outgoingPoints = selectRotatingRegionPoints(
    [
      { ip: "1.1.1.1", country: "CN", lat: 34.7, lon: 113.7 },
      { ip: "1.1.1.2", country: "CN", lat: 35.7, lon: 114.7 },
      { ip: "1.1.1.3", country: "CN", lat: 36.7, lon: 115.7 },
    ],
    outgoingNowMs
  );
  const incomingPoints = selectRotatingRegionPoints(
    [
      { ip: "1.1.1.1", country: "CN", lat: 34.7, lon: 113.7 },
      { ip: "1.1.1.2", country: "CN", lat: 35.7, lon: 114.7 },
      { ip: "1.1.1.3", country: "CN", lat: 36.7, lon: 115.7 },
    ],
    incomingNowMs
  );

  assert.equal(outgoingPoints.length, 1);
  assert.equal(incomingPoints.length, 1);
  assert.equal(outgoingPoints[0]?.transition.phase, "outgoing");
  assert.equal(incomingPoints[0]?.transition.phase, "incoming");
  assert.ok((outgoingPoints[0]?.transition.visibility ?? 0) > 0);
  assert.ok((outgoingPoints[0]?.transition.visibility ?? 0) < 1);
  assert.ok((incomingPoints[0]?.transition.visibility ?? 0) > 0);
  assert.ok((incomingPoints[0]?.transition.visibility ?? 0) < 1);
  assert.notEqual(outgoingPoints[0]?.point.ip, incomingPoints[0]?.point.ip);
});

test("rotation exposes a fully hidden handoff before the next point appears", () => {
  const base = resolveRegionRotation({
    regionKey: "CN",
    pointCount: 3,
    nowMs: 0,
  });
  const boundaryNowMs = base.cycleMs - base.phaseMs;
  const activePoints = selectRotatingRegionPoints(
    [
      { ip: "1.1.1.1", country: "CN", lat: 34.7, lon: 113.7 },
      { ip: "1.1.1.2", country: "CN", lat: 35.7, lon: 114.7 },
      { ip: "1.1.1.3", country: "CN", lat: 36.7, lon: 115.7 },
    ],
    boundaryNowMs
  );

  assert.equal(activePoints.length, 1);
  assert.equal(activePoints[0]?.transition.phase, "incoming");
  assert.equal(activePoints[0]?.transition.visibility, 0);
});
