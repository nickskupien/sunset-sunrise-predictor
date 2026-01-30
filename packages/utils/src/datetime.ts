export function localIsoToUtcMs(localIso: string, utcOffsetSeconds: string): number {
  if (typeof localIso !== "string") {
    throw new Error(`Expected local ISO datetime string, got ${typeof localIso}`);
  }

  const offsetSec =
    typeof utcOffsetSeconds === "number" ? utcOffsetSeconds : Number(utcOffsetSeconds);

  if (!Number.isFinite(offsetSec)) {
    throw new Error(`Invalid utc_offset_seconds: ${String(utcOffsetSeconds)}`);
  }

  // Treat the local time as if it's UTC by appending "Z", then undo the offset.
  const assumedUtcMs = Date.parse(localIso.trim() + "Z");
  if (!Number.isFinite(assumedUtcMs)) {
    throw new Error(`Invalid local ISO datetime: "${localIso}"`);
  }

  return assumedUtcMs - offsetSec * 1000;
}
