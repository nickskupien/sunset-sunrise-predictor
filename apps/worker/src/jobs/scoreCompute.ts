import type { Db } from "@sunset/db";
import { z } from "zod";
import {
  listScoresForDay,
  upsertScores,
  getSunEventMs,
  getLocationForecastGrid,
  getNearestHourlyForPoints,
} from "@sunset/db";

const PayloadSchema = z.object({
  locationId: z.number().int().positive(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["sunset", "sunrise"]),
});

const SCORE_TYPES = ["burning_sky", "gradient", "clear", "hazy"] as const;
type ScoreType = (typeof SCORE_TYPES)[number];

// ---------- math helpers ----------
function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function clamp100(x: number) {
  return Math.round(x < 0 ? 0 : x > 100 ? 100 : x);
}
function avg(nums: number[]) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}
function std(nums: number[]) {
  if (nums.length < 2) return 0;
  const m = avg(nums);
  const v = avg(nums.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}
function sweetSpot(pct: number, center: number, halfWidth: number) {
  const d = Math.abs(pct - center);
  return clamp01(1 - d / halfWidth);
}

// ---------- domain metrics ----------
type JoinedCell = { i: number; j: number; row: any };

function openness(row: any) {
  const low = row.cloudCoverLow / 100;
  const total = row.cloudCover / 100;
  return clamp01(1 - (0.7 * low + 0.3 * total));
}

function computeMetrics(
  kind: "sunset" | "sunrise",
  grid: { gridI: number; gridJ: number; forecastPointId: number }[],
  hourlyByPoint: Map<number, any>,
) {
  const joined: JoinedCell[] = [];
  for (const c of grid) {
    const r = hourlyByPoint.get(c.forecastPointId);
    if (r) joined.push({ i: c.gridI, j: c.gridJ, row: r });
  }

  if (joined.length < Math.max(40, Math.floor(grid.length * 0.6))) {
    throw new Error(
      `forecast_hourly missing for too many points (${joined.length}/${grid.length})`,
    );
  }

  const maxI = Math.max(...grid.map((c) => c.gridI));
  const maxJ = Math.max(...grid.map((c) => c.gridJ));
  const centerI = Math.round(maxI / 2);
  const centerJ = Math.round(maxJ / 2);

  const overhead = joined.filter((c) => c.j >= centerJ - 1 && c.j <= centerJ + 1);
  const sunwardHalf = (cells: JoinedCell[]) =>
    cells.filter((c) => (kind === "sunset" ? c.i < centerI : c.i > centerI));

  const sunward = sunwardHalf(overhead);
  const sunwardFallback = sunward.length ? sunward : sunwardHalf(joined);

  const openOver = overhead.map((c) => openness(c.row));
  const openSun = sunwardFallback.map((c) => openness(c.row));

  const pocketSunward = sunwardFallback.length
    ? sunwardFallback.filter((c) => c.row.cloudCoverLow <= 40 && c.row.cloudCover <= 80).length /
      sunwardFallback.length
    : 0;

  const totals = joined.map((c) => c.row.cloudCover);
  const lows = joined.map((c) => c.row.cloudCoverLow);
  const patchiness = clamp01((std(totals) / 35 + std(lows) / 35) / 2);

  // Use center cell time if available
  const centerCell = grid.find((c) => c.gridI === centerI && c.gridJ === centerJ);
  const matchedTimeMs =
    centerCell && hourlyByPoint.get(centerCell.forecastPointId)
      ? Number(hourlyByPoint.get(centerCell.forecastPointId).timeMs)
      : Number(joined[0].row.timeMs);

  return {
    matchedTimeMs,

    avgTotal: avg(joined.map((c) => c.row.cloudCover)),
    avgLow: avg(joined.map((c) => c.row.cloudCoverLow)),
    avgMid: avg(joined.map((c) => c.row.cloudCoverMid)),
    avgHigh: avg(joined.map((c) => c.row.cloudCoverHigh)),

    avgHumidity: avg(joined.map((c) => c.row.relativeHumidity)),
    avgPrecipProb: avg(joined.map((c) => c.row.precipitationProbability)),
    avgVisibility: avg(joined.map((c) => c.row.visibility)),
    avgPrecip: avg(joined.map((c) => c.row.precipitation)),
    avgTemp: avg(joined.map((c) => c.row.temperature)),

    avgOpenSunward: avg(openSun),
    avgOpenOverhead: avg(openOver),
    pocketSunward,
    deltaOpen: avg(openSun) - avg(openOver),

    patchiness,
  };
}

function scoreTypes(m: any): Record<ScoreType, number> {
  const lowGood = clamp01(1 - m.avgLow / 100);
  const precipBad = clamp01((m.avgPrecipProb - 15) / 60);
  const visGood = clamp01((m.avgVisibility - 4000) / 12000);
  const hazeBad = clamp01((m.avgHumidity - 70) / 25);

  const highSweet = sweetSpot(m.avgHigh, 35, 35);
  const midSweet = sweetSpot(m.avgMid, 30, 30);

  const pathGood = clamp01(0.6 * m.avgOpenSunward + 0.4 * m.pocketSunward);
  const gradientGood = clamp01((m.deltaOpen + 0.25) / 0.6);
  const patchGood = m.patchiness;

  const stormPenalty = precipBad;

  const clear =
    100 * clamp01(0.65 * lowGood + 0.35 * clamp01(1 - m.avgTotal / 100) - 0.35 * stormPenalty);

  const hazy = 100 * clamp01(0.55 * hazeBad + 0.45 * clamp01(1 - visGood) - 0.25 * stormPenalty);

  const gradient =
    100 *
    clamp01(
      0.35 * pathGood +
        0.3 * gradientGood +
        0.2 * (0.6 * highSweet + 0.4 * midSweet) +
        0.15 * patchGood -
        0.35 * stormPenalty -
        0.1 * hazeBad,
    );

  const burningSky =
    100 *
    clamp01(
      0.4 * pathGood +
        0.25 * (0.55 * highSweet + 0.45 * midSweet) +
        0.15 * patchGood +
        0.1 * visGood +
        0.1 * gradientGood -
        0.45 * stormPenalty -
        0.15 * hazeBad -
        0.1 * clamp01(m.avgLow / 85),
    );

  return {
    burning_sky: clamp100(burningSky),
    gradient: clamp100(gradient),
    clear: clamp100(clear),
    hazy: clamp100(hazy),
  };
}

// ---------- main ----------
export async function scoreCompute(db: Db["db"], payloadRaw: unknown) {
  const payload = PayloadSchema.parse(payloadRaw);

  const existing = await listScoresForDay(db, payload);
  if (existing.length > 0) return existing;

  const targetMs = await getSunEventMs(db, {
    locationId: payload.locationId,
    day: payload.day,
    kind: payload.kind,
  });

  const grid = await getLocationForecastGrid(db, payload.locationId);
  const pointIds = Array.from(new Set(grid.map((c) => c.forecastPointId)));

  const hourlyByPoint = await getNearestHourlyForPoints(db, {
    pointIds,
    targetMs,
    windowHours: 3,
  });

  const metrics = computeMetrics(payload.kind, grid, hourlyByPoint);
  const scored = scoreTypes(metrics);
  const computedAtMs = Date.now();

  const rows = SCORE_TYPES.map((type) => ({
    locationId: payload.locationId,
    day: payload.day,
    kind: payload.kind,
    type,
    score: scored[type],
    computedAtMs,
    inputs: {
      targetMs,
      matchedTimeMs: metrics.matchedTimeMs,

      avgTotal: Math.round(metrics.avgTotal),
      avgLow: Math.round(metrics.avgLow),
      avgMid: Math.round(metrics.avgMid),
      avgHigh: Math.round(metrics.avgHigh),

      avgHumidity: Math.round(metrics.avgHumidity),
      avgPrecipProb: Math.round(metrics.avgPrecipProb),
      avgVisibility: Math.round(metrics.avgVisibility),
      avgPrecip: Number(metrics.avgPrecip.toFixed(2)),
      avgTemp: Number(metrics.avgTemp.toFixed(1)),

      avgOpenSunward: Number(metrics.avgOpenSunward.toFixed(3)),
      avgOpenOverhead: Number(metrics.avgOpenOverhead.toFixed(3)),
      pocketSunward: Number(metrics.pocketSunward.toFixed(3)),
      deltaOpen: Number(metrics.deltaOpen.toFixed(3)),

      patchiness: Number(metrics.patchiness.toFixed(3)),
    },
  }));

  return upsertScores(db, rows);
}
