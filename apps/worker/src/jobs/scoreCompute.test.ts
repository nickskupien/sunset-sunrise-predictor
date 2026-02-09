import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sunset/db module
vi.mock("@sunset/db", () => ({
  listScoresForDay: vi.fn(),
  upsertScores: vi.fn(),
  getSunEventMs: vi.fn(),
  getLocationForecastGrid: vi.fn(),
  getNearestHourlyForPoints: vi.fn(),
}));

import {
  getSunEventMs,
  getLocationForecastGrid,
  getNearestHourlyForPoints,
  listScoresForDay,
  upsertScores,
} from "@sunset/db";
import { scoreCompute } from "./scoreCompute.js";

describe("scoreCompute", () => {
  const mockDb = {} as any;
  const ms = (iso: string) => new Date(iso).getTime();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return existing scores if they are already computed", async () => {
    const existingScores = [
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

    vi.mocked(listScoresForDay).mockResolvedValue(existingScores);

    const result = await scoreCompute(mockDb, {
      locationId: 42,
      day: "2026-01-15",
      kind: "sunset",
    });

    expect(result).toEqual(existingScores);
    expect(listScoresForDay).toHaveBeenCalledWith(mockDb, {
      locationId: 42,
      day: "2026-01-15",
      kind: "sunset",
    });
    expect(upsertScores).not.toHaveBeenCalled();
    expect(getSunEventMs).not.toHaveBeenCalled();
    expect(getLocationForecastGrid).not.toHaveBeenCalled();
    expect(getNearestHourlyForPoints).not.toHaveBeenCalled();
  });

  it("should compute and upsert new scores if none exist", async () => {
    vi.mocked(listScoresForDay).mockResolvedValue([]);
    const targetMs = ms("2026-01-15T23:00:00Z");
    vi.mocked(getSunEventMs).mockResolvedValue(targetMs);

    const gridSize = 11;
    const grid: { gridI: number; gridJ: number; forecastPointId: number }[] = [];
    const hourlyByPoint = new Map<number, any>();
    let id = 1;
    for (let j = 0; j < gridSize; j++) {
      for (let i = 0; i < gridSize; i++) {
        grid.push({ gridI: i, gridJ: j, forecastPointId: id });
        hourlyByPoint.set(id, {
          forecastPointId: id,
          timeMs: targetMs,
          relativeHumidity: 55 + (i + j) % 10,
          precipitationProbability: 5 + (i % 5),
          precipitation: 0,
          temperature: 8 - j * 0.2,
          cloudCover: 35 + ((i + j) % 5) * 8,
          cloudCoverLow: 10 + (i % 6) * 5,
          cloudCoverMid: 15 + (j % 6) * 5,
          cloudCoverHigh: 40 + ((i + j) % 6) * 5,
          visibility: 11000 + ((i + j) % 5) * 1000,
        });
        id++;
      }
    }

    vi.mocked(getLocationForecastGrid).mockResolvedValue(grid);
    vi.mocked(getNearestHourlyForPoints).mockResolvedValue(hourlyByPoint);
    vi.mocked(upsertScores).mockImplementation(async (_db, rows) => rows as any);

    const result = await scoreCompute(mockDb, {
      locationId: 42,
      day: "2026-01-15",
      kind: "sunset",
    });

    expect(result).toHaveLength(4);
    expect(listScoresForDay).toHaveBeenCalledWith(mockDb, {
      locationId: 42,
      day: "2026-01-15",
      kind: "sunset",
    });
    expect(getSunEventMs).toHaveBeenCalledWith(mockDb, {
      locationId: 42,
      day: "2026-01-15",
      kind: "sunset",
    });
    expect(getLocationForecastGrid).toHaveBeenCalledWith(mockDb, 42);
    expect(getNearestHourlyForPoints).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({
        targetMs,
        windowHours: 3,
      }),
    );
    expect(upsertScores).toHaveBeenCalledWith(
      mockDb,
      expect.arrayContaining([
        expect.objectContaining({
          locationId: 42,
          day: "2026-01-15",
          kind: "sunset",
          type: "burning_sky",
          score: expect.any(Number),
          inputs: expect.any(Object),
        }),
        expect.objectContaining({
          locationId: 42,
          day: "2026-01-15",
          kind: "sunset",
          type: "gradient",
          score: expect.any(Number),
          inputs: expect.any(Object),
        }),
        expect.objectContaining({
          locationId: 42,
          day: "2026-01-15",
          kind: "sunset",
          type: "clear",
          score: expect.any(Number),
          inputs: expect.any(Object),
        }),
        expect.objectContaining({
          locationId: 42,
          day: "2026-01-15",
          kind: "sunset",
          type: "hazy",
          score: expect.any(Number),
          inputs: expect.any(Object),
        }),
      ]),
    );
    for (const row of result) {
      expect(row.score).toBeGreaterThanOrEqual(0);
      expect(row.score).toBeLessThanOrEqual(100);
    }
  });

  it("should handle sunrise kind correctly", async () => {
    vi.mocked(listScoresForDay).mockResolvedValue([]);
    const targetMs = ms("2026-02-20T13:00:00Z");
    vi.mocked(getSunEventMs).mockResolvedValue(targetMs);

    const gridSize = 11;
    const grid: { gridI: number; gridJ: number; forecastPointId: number }[] = [];
    const hourlyByPoint = new Map<number, any>();
    let id = 10;
    for (let j = 0; j < gridSize; j++) {
      for (let i = 0; i < gridSize; i++) {
        grid.push({ gridI: i, gridJ: j, forecastPointId: id });
        hourlyByPoint.set(id, {
          forecastPointId: id,
          timeMs: targetMs,
          relativeHumidity: 75,
          precipitationProbability: 20,
          precipitation: 0,
          temperature: 2,
          cloudCover: 80,
          cloudCoverLow: 50,
          cloudCoverMid: 60,
          cloudCoverHigh: 70,
          visibility: 8000,
        });
        id++;
      }
    }

    vi.mocked(getLocationForecastGrid).mockResolvedValue(grid);
    vi.mocked(getNearestHourlyForPoints).mockResolvedValue(hourlyByPoint);
    vi.mocked(upsertScores).mockImplementation(async (_db, rows) => rows as any);

    await scoreCompute(mockDb, {
      locationId: 10,
      day: "2026-02-20",
      kind: "sunrise",
    });

    expect(upsertScores).toHaveBeenCalledWith(
      mockDb,
      expect.arrayContaining([
        expect.objectContaining({
          locationId: 10,
          day: "2026-02-20",
          kind: "sunrise",
        }),
      ]),
    );
  });

  it("should throw on invalid payload", async () => {
    await expect(
      scoreCompute(mockDb, { locationId: -1, day: "2026-01-15", kind: "sunset" }),
    ).rejects.toThrow();

    await expect(
      scoreCompute(mockDb, { locationId: 42, day: "invalid-date", kind: "sunset" }),
    ).rejects.toThrow();

    await expect(
      scoreCompute(mockDb, { locationId: 42, day: "2026-01-15", kind: "invalid" }),
    ).rejects.toThrow();
  });
});
