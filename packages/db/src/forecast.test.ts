import { describe, it, expect, vi, beforeEach } from "vitest";

import { getNearestHourlyForPoints } from "./forecast.js";

describe("getNearestHourlyForPoints", () => {
  const mockDb = {
    execute: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty map when pointIds is empty", async () => {
    const result = await getNearestHourlyForPoints(mockDb, {
      pointIds: [],
      targetMs: new Date("2026-01-30T23:00:00Z").getTime(),
      windowHours: 3,
    });

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect(mockDb.execute).not.toHaveBeenCalled();
  });

  it("returns a map of rows keyed by point id", async () => {
    mockDb.execute.mockResolvedValue({
      rows: [
        {
          forecastPointId: 1,
          timeMs: new Date("2026-01-30T23:00:00Z").getTime(),
          relativeHumidity: 50,
          precipitationProbability: 5,
          precipitation: 0,
          temperature: 6,
          cloudCover: 40,
          cloudCoverLow: 10,
          cloudCoverMid: 20,
          cloudCoverHigh: 30,
          visibility: 12000,
        },
      ],
    });

    const pointIds = Array.from({ length: 121 }, (_, idx) => idx + 1);
    const targetMs = new Date("2026-01-30T23:00:00Z").getTime();

    const result = await getNearestHourlyForPoints(mockDb, {
      pointIds,
      targetMs,
      windowHours: 3,
    });

    expect(mockDb.execute).toHaveBeenCalledTimes(1);

    const sqlArg = mockDb.execute.mock.calls[0]?.[0] as any;
    expect(sqlArg).toBeTruthy();
    expect(result.size).toBe(1);
    expect(result.get(1)).toMatchObject({
      forecastPointId: 1,
      precipitationProbability: 5,
      cloudCover: 40,
      visibility: 12000,
    });
  });
});
