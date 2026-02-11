import type { Db } from "@sunset/db";
import { z } from "zod";
import SunCalc from "suncalc";
import {
  upsertScores,
  getLocationById,
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

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const localTs = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );

  return localTs - date.getTime();
}

function dateForLocalNoon(day: string, timeZone: string) {
  const [y, m, d] = day.split("-").map((v) => Number(v));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`invalid day: ${day}`);
  }

  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offset = timeZoneOffsetMs(utcNoon, timeZone);
  return new Date(utcNoon.getTime() - offset);
}

function getSunEventMsFromCalc(params: {
  lat: number;
  lon: number;
  day: string;
  timeZone: string;
  kind: "sunset" | "sunrise";
}) {
  const date = dateForLocalNoon(params.day, params.timeZone);
  const times = SunCalc.getTimes(date, params.lat, params.lon);
  const event = params.kind === "sunset" ? times.sunset : times.sunrise;
  const ms = event?.getTime?.();
  if (!Number.isFinite(ms)) {
    throw new Error(
      `failed to compute ${params.kind} for day=${params.day} lat=${params.lat} lon=${params.lon}`,
    );
  }
  return ms;
}

function getSunDirection(params: { lat: number; lon: number; timeMs: number }) {
  const pos = SunCalc.getPosition(new Date(params.timeMs), params.lat, params.lon) as {
    azimuth?: number;
  };
  const az = pos?.azimuth;
  if (!Number.isFinite(az)) return null;

  // SunCalc azimuth: angle from south, positive towards west
  const east = -Math.sin(az as number);
  const north = -Math.cos(az as number);
  return { east, north };
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
  sunDir: { east: number; north: number } | null,
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
  const sunwardHalf = (cells: JoinedCell[]) => {
    if (!sunDir) {
      return cells.filter((c) => (kind === "sunset" ? c.i < centerI : c.i > centerI));
    }

    return cells.filter((c) => {
      const dx = c.i - centerI;
      const dy = c.j - centerJ;
      const dot = dx * sunDir.east + dy * sunDir.north;
      return dot > 0;
    });
  };

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

  const location = await getLocationById(db, payload.locationId);
  if (!location) throw new Error(`location not found id=${payload.locationId}`);
  if (!location.tz) throw new Error(`timezone missing for locationId=${payload.locationId}`);

  const targetMs = getSunEventMsFromCalc({
    lat: location.lat,
    lon: location.lon,
    day: payload.day,
    timeZone: location.tz,
    kind: payload.kind,
  });
  const sunDir = getSunDirection({ lat: location.lat, lon: location.lon, timeMs: targetMs });

  const grid = await getLocationForecastGrid(db, payload.locationId);
  const pointIds = Array.from(new Set(grid.map((c) => c.forecastPointId)));

  const hourlyByPoint = await getNearestHourlyForPoints(db, {
    pointIds,
    targetMs,
    windowHours: 3,
  });

  const metrics = computeMetrics(payload.kind, grid, hourlyByPoint, sunDir);
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
