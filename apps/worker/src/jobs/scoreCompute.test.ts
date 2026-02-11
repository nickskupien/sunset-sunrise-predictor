import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sunset/db module
vi.mock("@sunset/db", () => ({
  upsertScores: vi.fn(),
  getLocationById: vi.fn(),
  getLocationForecastGrid: vi.fn(),
  getNearestHourlyForPoints: vi.fn(),
}));

vi.mock("suncalc", () => ({
  default: {
    getTimes: vi.fn(),
    getPosition: vi.fn(),
  },
}));

import {
  getLocationById,
  getLocationForecastGrid,
  getNearestHourlyForPoints,
  upsertScores,
} from "@sunset/db";
import SunCalc from "suncalc";
import { scoreCompute } from "./scoreCompute.js";

describe("scoreCompute", () => {
  const mockDb = {} as any;
  const ms = (iso: string) => new Date(iso).getTime();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should recompute and upsert even if old scores already exist", async () => {
    const targetMs = ms("2026-01-15T23:00:00Z");
    vi.mocked(getLocationById).mockResolvedValue({
      locationId: 42,
      id: 42,
      lat: 43.25,
      lon: -79.87,
      tz: "America/Toronto",
    } as any);
    vi.mocked(SunCalc.getTimes).mockReturnValue({
      sunrise: new Date(targetMs - 12 * 60 * 60 * 1000),
      sunset: new Date(targetMs),
    } as any);
    vi.mocked(SunCalc.getPosition).mockReturnValue({
      azimuth: Math.PI / 2,
    } as any);

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

    vi.mocked(upsertScores).mockImplementation(async (_db, rows) => rows as any);

    const result = await scoreCompute(mockDb, {
      locationId: 42,
      day: "2026-01-15",
      kind: "sunset",
    });

    expect(result).toHaveLength(4);
    expect(getLocationById).toHaveBeenCalledWith(mockDb, 42);
    expect(SunCalc.getTimes).toHaveBeenCalled();
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

  it("should compute and upsert new scores", async () => {
    const targetMs = ms("2026-01-15T23:00:00Z");
    vi.mocked(getLocationById).mockResolvedValue({
      id: 42,
      lat: 43.25,
      lon: -79.87,
      tz: "America/Toronto",
    } as any);
    vi.mocked(SunCalc.getTimes).mockReturnValue({
      sunrise: new Date(targetMs - 12 * 60 * 60 * 1000),
      sunset: new Date(targetMs),
    } as any);
    vi.mocked(SunCalc.getPosition).mockReturnValue({
      azimuth: Math.PI / 2,
    } as any);

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

    await scoreCompute(mockDb, {
      locationId: 42,
      day: "2026-01-15",
      kind: "sunset",
    });

    expect(upsertScores).toHaveBeenCalledTimes(1);
  });

  it("should handle sunrise kind correctly", async () => {
    const targetMs = ms("2026-02-20T13:00:00Z");
    vi.mocked(getLocationById).mockResolvedValue({
      id: 10,
      lat: 43.25,
      lon: -79.87,
      tz: "America/Toronto",
    } as any);
    vi.mocked(SunCalc.getTimes).mockReturnValue({
      sunrise: new Date(targetMs),
      sunset: new Date(targetMs + 12 * 60 * 60 * 1000),
    } as any);
    vi.mocked(SunCalc.getPosition).mockReturnValue({
      azimuth: -Math.PI / 2,
    } as any);

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
