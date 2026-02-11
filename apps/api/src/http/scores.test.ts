import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

// Mock @sunset/db module
vi.mock("@sunset/db", () => ({
  createDb: vi.fn(() => ({
    db: {},
    pool: { end: vi.fn() },
  })),
  listScoresForDay: vi.fn(),
  enqueueJob: vi.fn(),
  getLocationByKey: vi.fn(),
  getLocationById: vi.fn(),
  makeLocationKey: vi.fn(() => "43.000,-79.000"),
  upsertLocation: vi.fn(),
}));

import {
  createDb,
  listScoresForDay,
  enqueueJob,
  getLocationByKey,
  getLocationById,
  makeLocationKey,
  upsertLocation,
} from "@sunset/db";
import { registerScoresRoutes } from "./scores.js";

function makeQueuedJob(input: { type: string; key: string; payload: unknown }) {
  const now = new Date();
  return {
    id: Math.floor(Math.random() * 1000) + 1,
    type: input.type,
    key: input.key,
    payload: input.payload,
    status: "queued" as const,
    runAfter: now,
    attempts: 0,
    maxAttempts: 5,
    lockedBy: null,
    lockedAt: null,
    lastError: null,
    lastErrorAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("registerScoresRoutes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";

    app = Fastify();
    await registerScoresRoutes(app);
    await app.ready();
  });

  it("should return existing scores for a given location, day, and kind", async () => {
    const mockScores = [
      {
        id: 1,
        locationId: 42,
        day: "2026-01-15",
        kind: "sunset",
        type: "burning_sky",
        score: 70,
        inputs: {},
        computedAtMs: 1705300000000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        locationId: 42,
        day: "2026-01-15",
        kind: "sunset",
        type: "gradient",
        score: 50,
        inputs: {},
        computedAtMs: 1705300000000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    vi.mocked(listScoresForDay).mockResolvedValue(mockScores);

    const response = await app.inject({
      method: "GET",
      url: "/scores/42/2026-01-15/sunset",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({
      ok: true,
      status: "ready",
      scores: expect.arrayContaining([
        expect.objectContaining({ type: "burning_sky", score: 70 }),
        expect.objectContaining({ type: "gradient", score: 50 }),
      ]),
    });

    expect(listScoresForDay).toHaveBeenCalledWith(expect.anything(), {
      locationId: 42,
      day: "2026-01-15",
      kind: "sunset",
    });
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("should enqueue a score.compute job if no scores exist", async () => {
    vi.mocked(listScoresForDay).mockResolvedValue([]);

    const mockJob = {
      id: 123,
      type: "score.compute",
      key: "score:42:2026-01-15:sunset",
      payload: { locationId: 42, day: "2026-01-15", kind: "sunset" },
      status: "queued",
    };
    vi.mocked(enqueueJob).mockResolvedValue(mockJob as any);

    const response = await app.inject({
      method: "GET",
      url: "/scores/42/2026-01-15/sunset",
    });

    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    expect(body).toEqual({
      ok: true,
      status: "pending",
      jobId: 123,
      job: expect.objectContaining({
        id: 123,
        type: "score.compute",
        key: "score:42:2026-01-15:sunset",
      }),
    });

    expect(listScoresForDay).toHaveBeenCalledWith(expect.anything(), {
      locationId: 42,
      day: "2026-01-15",
      kind: "sunset",
    });
    expect(enqueueJob).toHaveBeenCalledWith(expect.anything(), {
      type: "score.compute",
      key: "score:42:2026-01-15:sunset",
      payload: {
        locationId: 42,
        day: "2026-01-15",
        kind: "sunset",
      },
      runAfterMs: expect.any(Number),
    });
  });

  it("should prepare jobs for coordinates", async () => {
    vi.mocked(upsertLocation).mockResolvedValue({
      id: 7,
      key: "43.000,-79.000",
      lat: 43,
      lon: -79,
      tz: "America/Toronto",
    } as any);

    vi.mocked(enqueueJob).mockImplementation(async (_db, input: any) =>
      makeQueuedJob({
        type: input.type,
        key: input.key,
        payload: input.payload,
      }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/scores/prepare",
      payload: { lat: 43.25, lon: -79.87, forecastDays: 3, kinds: ["sunset"] },
    });

    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("queued");
    expect(body.requestId).toBeDefined();
    expect(body.locationId).toBe(7);
    expect(body.kinds).toEqual(["sunset"]);
    expect(body.forecastDays).toBe(3);
    expect(enqueueJob).toHaveBeenCalledWith(expect.anything(), {
      type: "forecast.refresh",
      key: "forecast_hourly:location:7",
      payload: {
        locationId: 7,
        forecastDays: 3,
        schedule: {
          forecastDays: 3,
          kinds: ["sunset"],
        },
      },
      runAfterMs: expect.any(Number),
    });
  });

  it("should prepare jobs for location id", async () => {
    vi.mocked(getLocationById).mockResolvedValue({
      id: 7,
      key: "43.000,-79.000",
      lat: 43,
      lon: -79,
      tz: "America/Toronto",
    } as any);

    vi.mocked(enqueueJob).mockImplementation(async (_db, input: any) =>
      makeQueuedJob({
        type: input.type,
        key: input.key,
        payload: input.payload,
      }),
    );

    const response = await app.inject({
      method: "POST",
      url: "/scores/prepare/7",
      payload: { forecastDays: 3, kinds: ["sunset"] },
    });

    expect(response.statusCode).toBe(202);
    const body = JSON.parse(response.body);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("queued");
    expect(body.requestId).toBeDefined();
    expect(body.locationId).toBe(7);
    expect(body.kinds).toEqual(["sunset"]);
    expect(body.forecastDays).toBe(3);
    expect(enqueueJob).toHaveBeenCalledWith(expect.anything(), {
      type: "forecast.refresh",
      key: "forecast_hourly:location:7",
      payload: {
        locationId: 7,
        forecastDays: 3,
        schedule: {
          forecastDays: 3,
          kinds: ["sunset"],
        },
      },
      runAfterMs: expect.any(Number),
    });
  });

  it("should return scores by coordinates when ready", async () => {
    vi.mocked(getLocationByKey).mockResolvedValue({
      id: 9,
      key: "43.000,-79.000",
      lat: 43,
      lon: -79,
      tz: "America/Toronto",
    } as any);

    vi.mocked(listScoresForDay).mockResolvedValue([
      {
        id: 1,
        locationId: 9,
        day: "2026-01-15",
        kind: "sunset",
        type: "burning_sky",
        score: 70,
        inputs: {},
        computedAtMs: 1705300000000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/scores/by-coords?lat=43&lon=-79&day=2026-01-15&kind=sunset",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ready");
    expect(body.locationId).toBe(9);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("should return missing by coordinates when not ready", async () => {
    vi.mocked(getLocationByKey).mockResolvedValue({
      id: 11,
      key: "43.000,-79.000",
      lat: 43,
      lon: -79,
      tz: "America/Toronto",
    } as any);

    vi.mocked(listScoresForDay).mockResolvedValue([]);

    const response = await app.inject({
      method: "GET",
      url: "/scores/by-coords?lat=43&lon=-79&day=2026-01-15&kind=sunset",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("missing");
    expect(body.locationId).toBe(11);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it("should return status for coordinates", async () => {
    vi.mocked(getLocationByKey).mockResolvedValue({
      id: 12,
      key: "43.000,-79.000",
      lat: 43,
      lon: -79,
      tz: "America/Toronto",
    } as any);

    vi.mocked(listScoresForDay).mockResolvedValue([]);
    vi.mocked(listScoresForDay).mockResolvedValueOnce([
      {
        id: 1,
        locationId: 12,
        day: "2026-01-15",
        kind: "sunset",
        type: "burning_sky",
        score: 70,
        inputs: {},
        computedAtMs: 1705300000000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/scores/status?lat=43&lon=-79&forecastDays=1&kinds=sunset",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ready");
    expect(body.locationId).toBe(12);
  });

  it("should return status for location id", async () => {
    vi.mocked(getLocationById).mockResolvedValue({
      id: 12,
      key: "43.000,-79.000",
      lat: 43,
      lon: -79,
      tz: "America/Toronto",
    } as any);

    vi.mocked(listScoresForDay).mockResolvedValue([]);
    vi.mocked(listScoresForDay).mockResolvedValueOnce([
      {
        id: 1,
        locationId: 12,
        day: "2026-01-15",
        kind: "sunset",
        type: "burning_sky",
        score: 70,
        inputs: {},
        computedAtMs: 1705300000000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/scores/status/12?forecastDays=1&kinds=sunset",
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ready");
    expect(body.locationId).toBe(12);
  });
});
