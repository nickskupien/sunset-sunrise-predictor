import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @sunset/db module
vi.mock("@sunset/db", () => ({
  listScoresForDay: vi.fn(),
  upsertScores: vi.fn(),
}));

import { listScoresForDay, upsertScores } from "@sunset/db";
import { scoreCompute } from "./scoreCompute.js";

describe("scoreCompute", () => {
  const mockDb = {} as any;

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
  });

  it("should compute and upsert new scores if none exist", async () => {
    vi.mocked(listScoresForDay).mockResolvedValue([]);

    const savedScores = [
      {
        id: 1,
        locationId: 42,
        day: "2026-01-15",
        kind: "sunset",
        type: "burning_sky",
        score: 70,
        inputs: {},
        computedAtMs: expect.any(Number),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        locationId: 42,
        day: "2026-01-15",
        kind: "sunset",
        type: "clear",
        score: 0,
        inputs: {},
        computedAtMs: expect.any(Number),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 3,
        locationId: 42,
        day: "2026-01-15",
        kind: "sunset",
        type: "gradient",
        score: 50,
        inputs: {},
        computedAtMs: expect.any(Number),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 4,
        locationId: 42,
        day: "2026-01-15",
        kind: "sunset",
        type: "hazy",
        score: 0,
        inputs: {},
        computedAtMs: expect.any(Number),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    vi.mocked(upsertScores).mockResolvedValue(savedScores);

    const result = await scoreCompute(mockDb, {
      locationId: 42,
      day: "2026-01-15",
      kind: "sunset",
    });

    expect(result).toEqual(savedScores);
    expect(listScoresForDay).toHaveBeenCalledWith(mockDb, {
      locationId: 42,
      day: "2026-01-15",
      kind: "sunset",
    });
    expect(upsertScores).toHaveBeenCalledWith(
      mockDb,
      expect.arrayContaining([
        expect.objectContaining({
          locationId: 42,
          day: "2026-01-15",
          kind: "sunset",
          type: "burning_sky",
          score: 70,
          inputs: {},
        }),
        expect.objectContaining({
          locationId: 42,
          day: "2026-01-15",
          kind: "sunset",
          type: "gradient",
          score: 50,
          inputs: {},
        }),
        expect.objectContaining({
          locationId: 42,
          day: "2026-01-15",
          kind: "sunset",
          type: "clear",
          score: 0,
          inputs: {},
        }),
        expect.objectContaining({
          locationId: 42,
          day: "2026-01-15",
          kind: "sunset",
          type: "hazy",
          score: 0,
          inputs: {},
        }),
      ]),
    );
  });

  it("should handle sunrise kind correctly", async () => {
    vi.mocked(listScoresForDay).mockResolvedValue([]);
    vi.mocked(upsertScores).mockResolvedValue([]);

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
