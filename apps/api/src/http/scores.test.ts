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
}));

import { createDb, listScoresForDay, enqueueJob } from "@sunset/db";
import { registerScoresRoutes } from "./scores.js";

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
});
