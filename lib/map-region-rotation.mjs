const REGION_DISPLAY_MS = 3000;
const REGION_TRANSITION_MS = 1000;
const REGION_CYCLE_MS = REGION_DISPLAY_MS + REGION_TRANSITION_MS + REGION_TRANSITION_MS;

function hashStableString(value) {
  let hash = 2166136261;

  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createDeterministicRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function buildPermutation(length, seedKey) {
  const permutation = Array.from({ length }, (_, index) => index);
  const random = createDeterministicRandom(hashStableString(seedKey) || 1);

  for (let index = permutation.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [permutation[index], permutation[swapIndex]] = [permutation[swapIndex], permutation[index]];
  }

  return permutation;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function resolveRegionSelectionForStep(regionKey, pointCount, step) {
  const normalizedPointCount = Math.max(1, Math.trunc(pointCount));
  const round = Math.floor(step / normalizedPointCount);
  const indexInRound = step % normalizedPointCount;
  const permutation =
    normalizedPointCount === 1 ? [0] : buildPermutation(normalizedPointCount, `${regionKey}:${round}`);

  return {
    index: permutation[indexInRound] ?? 0,
    indexInRound,
    round,
  };
}

export function resolveRegionRotation({ regionKey, pointCount, nowMs }) {
  const normalizedRegionKey = String(regionKey || "Unknown").trim() || "Unknown";
  const normalizedPointCount = Math.max(1, Math.trunc(pointCount));
  const normalizedNowMs = Math.max(0, Math.trunc(nowMs));
  const cycleMs = REGION_CYCLE_MS;
  const phaseMs = hashStableString(`${normalizedRegionKey}:phase`) % cycleMs;
  const step = Math.floor((normalizedNowMs + phaseMs) / cycleMs);
  const elapsedInCycle = (normalizedNowMs + phaseMs) % cycleMs;
  const selection = resolveRegionSelectionForStep(normalizedRegionKey, normalizedPointCount, step);
  const transitionMs = REGION_TRANSITION_MS;

  return {
    cycleMs,
    elapsedInCycle,
    index: selection.index,
    indexInRound: selection.indexInRound,
    phaseMs,
    round: selection.round,
    step,
    transitionMs,
  };
}

export function selectRotatingRegionPoints(points, nowMs) {
  const regionGroups = new Map();

  for (const point of points) {
    // Group by the raw upstream country/region code exactly as stored.
    // Do not fold region codes like HK into CN.
    const regionKey = String(point?.country || "Unknown").trim() || "Unknown";
    const existing = regionGroups.get(regionKey);

    if (existing) {
      existing.push(point);
      continue;
    }

    regionGroups.set(regionKey, [point]);
  }

  return [...regionGroups.entries()]
    .sort(([leftRegion], [rightRegion]) => leftRegion.localeCompare(rightRegion))
    .map(([regionKey, regionPoints]) => {
      const orderedPoints = [...regionPoints].sort((left, right) => String(left.ip).localeCompare(String(right.ip)));
      const rotation = resolveRegionRotation({
        regionKey,
        pointCount: orderedPoints.length,
        nowMs,
      });

      if (orderedPoints.length <= 1) {
        return [
          {
            cycleMs: rotation.cycleMs,
            elapsedInCycle: rotation.elapsedInCycle,
            point: orderedPoints[0],
            regionKey,
            transition: {
              phase: "steady",
              visibility: 1,
            },
          },
        ];
      }

      const currentPoint = orderedPoints[rotation.index] ?? orderedPoints[0];
      if (rotation.elapsedInCycle < rotation.transitionMs) {
        const incomingProgress = smoothstep(rotation.elapsedInCycle / rotation.transitionMs);

        return [
          {
            cycleMs: rotation.cycleMs,
            elapsedInCycle: rotation.elapsedInCycle,
            point: currentPoint,
            regionKey,
            transition: {
              phase: "incoming",
              visibility: incomingProgress,
            },
          },
        ];
      }

      if (rotation.elapsedInCycle < rotation.cycleMs - rotation.transitionMs) {
        return [
          {
            cycleMs: rotation.cycleMs,
            elapsedInCycle: rotation.elapsedInCycle,
            point: currentPoint,
            regionKey,
            transition: {
              phase: "steady",
              visibility: 1,
            },
          },
        ];
      }

      const outgoingProgress = smoothstep(
        (rotation.elapsedInCycle - (rotation.cycleMs - rotation.transitionMs)) / rotation.transitionMs
      );

      return [
        {
          cycleMs: rotation.cycleMs,
          elapsedInCycle: rotation.elapsedInCycle,
          point: currentPoint,
          regionKey,
          transition: {
            phase: "outgoing",
            visibility: 1 - outgoingProgress,
          },
        },
      ];
    })
    .flat();
}
