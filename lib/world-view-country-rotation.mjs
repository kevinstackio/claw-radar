const WORLD_ROTATION_MIN_MS = 3600;
const WORLD_ROTATION_RANGE_MS = 2800;
const WORLD_TRANSITION_MIN_MS = 760;
const WORLD_TRANSITION_RANGE_MS = 280;

function hashStableString(value) {
  let hash = 2166136261;

  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function resolvePointIndexForStep(pointCount, step) {
  if (pointCount <= 1) {
    return {
      index: 0,
      indexInRound: 0,
      round: 0,
    };
  }

  const round = Math.floor(step / pointCount);
  const indexInRound = ((step % pointCount) + pointCount) % pointCount;

  return {
    index: indexInRound,
    indexInRound,
    round,
  };
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export function resolveWorldViewCountryRotation({ countryKey, pointCount, nowMs }) {
  const normalizedCountryKey = String(countryKey || "Unknown").trim() || "Unknown";
  const normalizedPointCount = Math.max(1, Math.trunc(pointCount));
  const normalizedNowMs = Math.max(0, Math.trunc(nowMs));
  const seed = hashStableString(normalizedCountryKey);
  const cycleMs = WORLD_ROTATION_MIN_MS + (seed % WORLD_ROTATION_RANGE_MS);
  const phaseMs = seed % cycleMs;
  const step = Math.floor((normalizedNowMs + phaseMs) / cycleMs);
  const selection = resolvePointIndexForStep(normalizedPointCount, step);

  return {
    cycleMs,
    index: selection.index,
    indexInRound: selection.indexInRound,
    phaseMs,
    round: selection.round,
    step,
  };
}

function resolveCountryFrames({ countryKey, orderedPoints, nowMs }) {
  const rotation = resolveWorldViewCountryRotation({
    countryKey,
    pointCount: orderedPoints.length,
    nowMs,
  });

  if (orderedPoints.length === 1) {
    return [
      {
        countryKey,
        point: orderedPoints[0],
        transition: {
          cycleMs: rotation.cycleMs,
          phase: "steady",
          visibility: 1,
        },
      },
    ];
  }

  const transitionMs = Math.min(
    rotation.cycleMs - 1,
    WORLD_TRANSITION_MIN_MS + ((hashStableString(countryKey) >>> 5) % WORLD_TRANSITION_RANGE_MS)
  );
  const elapsedInCycle = (Math.max(0, Math.trunc(nowMs)) + rotation.phaseMs) % rotation.cycleMs;

  if (elapsedInCycle < transitionMs) {
    const progress = smoothstep(elapsedInCycle / transitionMs);

    return [
      {
        countryKey,
        point: orderedPoints[rotation.index],
        transition: {
          cycleMs: rotation.cycleMs,
          phase: "incoming",
          visibility: progress,
        },
      },
    ];
  }

  if (elapsedInCycle > rotation.cycleMs - transitionMs) {
    const progress = smoothstep((elapsedInCycle - (rotation.cycleMs - transitionMs)) / transitionMs);

    return [
      {
        countryKey,
        point: orderedPoints[rotation.index],
        transition: {
          cycleMs: rotation.cycleMs,
          phase: "outgoing",
          visibility: 1 - progress,
        },
      },
    ];
  }

  return [
    {
      countryKey,
      point: orderedPoints[rotation.index],
      transition: {
        cycleMs: rotation.cycleMs,
        phase: "steady",
        visibility: 1,
      },
    },
  ];
}

export function selectWorldViewCountryPoints(points, nowMs) {
  const countryGroups = new Map();

  for (const point of points) {
    const countryKey = String(point?.country || "Unknown").trim() || "Unknown";
    const existing = countryGroups.get(countryKey);

    if (existing) {
      existing.push(point);
      continue;
    }

    countryGroups.set(countryKey, [point]);
  }

  return [...countryGroups.entries()]
    .sort(([leftCountry], [rightCountry]) => leftCountry.localeCompare(rightCountry))
    .map(([countryKey, countryPoints]) => {
      const orderedPoints = [...countryPoints].sort((left, right) => String(left.ip).localeCompare(String(right.ip)));
      return resolveCountryFrames({
        countryKey,
        orderedPoints,
        nowMs,
      });
    })
    .flat();
}
