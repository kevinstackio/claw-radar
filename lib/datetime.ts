export function formatSnapshotTimestamp(value?: string | null) {
  if (!value) {
    return "No data yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  // Use a deterministic UTC string to avoid server/client locale mismatches.
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function formatSnapshotTime(value?: string | null) {
  if (!value) {
    return "No data yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function formatSnapshotDate(value?: string | null) {
  if (!value) {
    return "No data yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}
