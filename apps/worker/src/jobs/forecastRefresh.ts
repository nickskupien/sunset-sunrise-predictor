import type { Db } from "@sunset/db";
import {
  enqueueJob,
  upsertForecastPoints,
  replaceLocationGridLinks,
  upsertForecastHourly,
  getLocationById,
  setLocationTimezone,
} from "@sunset/db";
import { z } from "zod";

/**
 * Payload is intentionally small and defaults match:
 * - 80km x 80km square (halfSizeKm=40)
 * - 4km spacing => 21x21 grid
 * - 1km global snapping for dedupe
 * - forecastDays default 7
 */
const PayloadSchema = z.object({
  locationId: z.number().int().positive(),

  forecastDays: z.number().int().min(1).max(16).default(7),

  halfSizeKm: z.number().positive().default(40),
  stepKm: z.number().positive().default(4),

  // Global dedupe snapping in km (1km is a good default)
  snapKm: z.number().positive().default(1),

  // Optional: use a specific Open-Meteo endpoint if you want later
  // baseUrl: z.string().url().optional(),

  // Optional: enqueue score.schedule after refresh completes
  schedule: z
    .object({
      forecastDays: z.number().int().min(1).max(16),
      kinds: z.array(z.enum(["sunset", "sunrise"])),
    })
    .optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

// --- Web Mercator helpers (meters) ---
// This makes the "square in km" actually square-ish regardless of latitude,
// and makes snapping easy.
const R = 6378137;

function degToRad(d: number) {
  return (d * Math.PI) / 180;
}
function radToDeg(r: number) {
  return (r * 180) / Math.PI;
}

function toMercatorMeters(lat: number, lon: number) {
  const x = R * degToRad(lon);
  const y = R * Math.log(Math.tan(Math.PI / 4 + degToRad(lat) / 2));
  return { x, y };
}

function fromMercatorMeters(x: number, y: number) {
  const lon = radToDeg(x / R);
  const lat = radToDeg(2 * Math.atan(Math.exp(y / R)) - Math.PI / 2);
  return { lat, lon };
}

function snapMeters(v: number, snapM: number) {
  return Math.round(v / snapM) * snapM;
}

function pointKeyFromSnappedMeters(snapM: number, x: number, y: number) {
  const xi = Math.round(x / snapM);
  const yi = Math.round(y / snapM);
  return `m${snapM}:${xi}:${yi}`;
}

function buildOffsetsMeters(halfSizeKm: number, stepKm: number) {
  const halfM = halfSizeKm * 1000;
  const stepM = stepKm * 1000;

  // inclusive range: -half .. +half (so 40km and 4km => 21 points)
  const offsets: number[] = [];
  for (let m = -halfM; m <= halfM + 1e-6; m += stepM) {
    offsets.push(Math.round(m));
  }
  return offsets;
}

function chunk<T>(values: T[], size: number) {
  if (size <= 0) throw new Error(`invalid chunk size: ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

function buildUrl(base: string, params: Record<string, string>) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

// Open-Meteo can return either an object or a "responses" array for multi-point.
// Be defensive.
function normalizeOpenMeteoResponses(json: any) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.responses)) return json.responses;
  return [json];
}

// Converts array value to a safe number (fallback 0).
function num(v: any) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function forecastRefresh(db: Db["db"], payloadRaw: unknown) {
  const payload = PayloadSchema.parse(payloadRaw);

  const loc = await getLocationById(db, payload.locationId);

  if (!loc) throw new Error(`location not found id=${payload.locationId}`);

  const offsetsM = buildOffsetsMeters(payload.halfSizeKm, payload.stepKm);
  const snapM = Math.round(payload.snapKm * 1000);

  const center = toMercatorMeters(loc.lat, loc.lon);

  // Build grid cells and globally deduped point set
  const gridCells: { gridI: number; gridJ: number; key: string }[] = [];
  const pointsByKey = new Map<string, { key: string; lat: number; lon: number }>();

  for (let j = 0; j < offsetsM.length; j++) {
    for (let i = 0; i < offsetsM.length; i++) {
      const x = center.x + offsetsM[i];
      const y = center.y + offsetsM[j];

      const xs = snapMeters(x, snapM);
      const ys = snapMeters(y, snapM);

      const key = pointKeyFromSnappedMeters(snapM, xs, ys);
      const { lat, lon } = fromMercatorMeters(xs, ys);

      gridCells.push({ gridI: i, gridJ: j, key });

      if (!pointsByKey.has(key)) {
        pointsByKey.set(key, { key, lat, lon });
      }
    }
  }

  const uniquePoints = [...pointsByKey.values()];

  // 1) Upsert global forecast points and get IDs
  const idByKey = await upsertForecastPoints(db, uniquePoints);

  // 2) Store (location -> grid cell) links (deterministic mapping)
  await replaceLocationGridLinks(
    db,
    payload.locationId,
    gridCells.map((c) => ({
      forecastPointId: idByKey.get(c.key)!,
      gridI: c.gridI,
      gridJ: c.gridJ,
    })),
  );

  // 3) Fetch hourly forecast for all unique points in one request
  const baseUrl = process.env.OPEN_METEO_BASE_URL ?? "https://api.open-meteo.com/v1/forecast";

  const hourly = [
    "relative_humidity_2m",
    "precipitation_probability",
    "precipitation",
    "temperature_2m",
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "visibility",
  ].join(",");
  const targetRequestCount = 2;
  const pointsPerRequest = Math.max(1, Math.ceil(uniquePoints.length / targetRequestCount));
  const coordinatePrecision = 3;

  if (typeof fetch !== "function") {
    throw new Error("global fetch() is not available (Node >= 18 required)");
  }

  const hourlyRows: Parameters<typeof upsertForecastHourly>[1] = [];
  const centerPointGlobalIndex = Math.floor(uniquePoints.length / 2);
  let centerTz: string | undefined;
  let processedCount = 0;

  for (const pointsChunk of chunk(uniquePoints, pointsPerRequest)) {
    const urlGrid = buildUrl(baseUrl, {
      latitude: pointsChunk.map((p) => p.lat.toFixed(coordinatePrecision)).join(","),
      longitude: pointsChunk.map((p) => p.lon.toFixed(coordinatePrecision)).join(","),
      hourly,
      forecast_days: String(payload.forecastDays),
      past_days: "1",
      timezone: "auto",
      timeformat: "unixtime",
    });

    const resGrid = await fetch(urlGrid);
    if (!resGrid.ok)
      throw new Error(`open-meteo grid error ${resGrid.status}: ${await resGrid.text()}`);
    const gridJson = await resGrid.json();
    const responses = normalizeOpenMeteoResponses(gridJson);

    if (responses.length !== pointsChunk.length) {
      throw new Error(
        `open-meteo response mismatch: got ${responses.length}, expected ${pointsChunk.length}`,
      );
    }

    for (let idx = 0; idx < responses.length; idx++) {
      const r = responses[idx];
      const point = pointsChunk[idx];
      const pointId = idByKey.get(point.key)!;
      const globalIndex = processedCount + idx;
      if (globalIndex === centerPointGlobalIndex && typeof r?.timezone === "string") {
        centerTz = r.timezone;
      }

      const timesSec: any[] = r?.hourly?.time ?? [];
      const rh: any[] = r?.hourly?.relative_humidity_2m ?? [];
      const pp: any[] = r?.hourly?.precipitation_probability ?? [];
      const pr: any[] = r?.hourly?.precipitation ?? [];
      const temp: any[] = r?.hourly?.temperature_2m ?? [];
      const cc: any[] = r?.hourly?.cloud_cover ?? [];
      const ccl: any[] = r?.hourly?.cloud_cover_low ?? [];
      const ccm: any[] = r?.hourly?.cloud_cover_mid ?? [];
      const cch: any[] = r?.hourly?.cloud_cover_high ?? [];
      const vis: any[] = r?.hourly?.visibility ?? [];

      const n = timesSec.length;

      for (let t = 0; t < n; t++) {
        hourlyRows.push({
          forecastPointId: pointId,
          timeMs: Math.trunc(num(timesSec[t]) * 1000),

          relativeHumidity: Math.trunc(num(rh[t])),
          precipitationProbability: Math.trunc(num(pp[t])),
          precipitation: num(pr[t]),
          temperature: num(temp[t]),

          cloudCover: Math.trunc(num(cc[t])),
          cloudCoverLow: Math.trunc(num(ccl[t])),
          cloudCoverMid: Math.trunc(num(ccm[t])),
          cloudCoverHigh: Math.trunc(num(cch[t])),

          visibility: Math.trunc(num(vis[t])),
        });
      }
    }

    processedCount += pointsChunk.length;
  }

  await upsertForecastHourly(db, hourlyRows);

  // 4) Update location timezone from the center grid response
  if (centerTz && centerTz.length > 0 && centerTz !== loc.tz) {
    await setLocationTimezone(db, payload.locationId, centerTz);
  }

  if (payload.schedule) {
    await enqueueJob(db, {
      type: "score.schedule",
      key: `score_schedule:${payload.locationId}:${payload.schedule.forecastDays}:${payload.schedule.kinds.join(",")}`,
      payload: {
        locationId: payload.locationId,
        forecastDays: payload.schedule.forecastDays,
        kinds: payload.schedule.kinds,
      },
      runAfterMs: Date.now(),
    });
  }

  return {
    locationId: payload.locationId,
    gridSize: offsetsM.length, // should be 21
    gridCells: offsetsM.length * offsetsM.length, // should be 441
    uniquePoints: uniquePoints.length,
    forecastDays: payload.forecastDays,
    hourlyRows: hourlyRows.length,
    snapKm: payload.snapKm,
  };
}
