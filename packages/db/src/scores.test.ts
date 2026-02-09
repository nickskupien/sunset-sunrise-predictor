import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock chain for drizzle query builder
const mockReturning = vi.fn();
const mockOnConflictDoUpdate = vi.fn(() => ({ returning: mockReturning }));
const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

const mockDb = {
  insert: mockInsert,
  select: vi.fn(),
} as any;

// Import after setting up mocks
import { upsertScores, type UpsertScoreInput } from "./scores.js";

describe("upsertScores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should correctly insert new sunset scores", async () => {
    const insertedRows = [
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
    mockReturning.mockResolvedValue(insertedRows);

    const input: UpsertScoreInput[] = [
      {
        locationId: 42,
        day: "2026-01-15",
        kind: "sunset",
        type: "burning_sky",
        score: 70,
        computedAtMs: 1705300000000,
        inputs: {},
      },
      {
        locationId: 42,
        day: "2026-01-15",
        kind: "sunset",
        type: "gradient",
        score: 50,
        computedAtMs: 1705300000000,
        inputs: {},
      },
    ];

    const result = await upsertScores(mockDb, input);

    expect(result).toEqual(insertedRows);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          locationId: 42,
          day: "2026-01-15",
          kind: "sunset",
          type: "burning_sky",
          score: 70,
        }),
        expect.objectContaining({
          locationId: 42,
          day: "2026-01-15",
          kind: "sunset",
          type: "gradient",
          score: 50,
        }),
      ]),
    );
    expect(mockOnConflictDoUpdate).toHaveBeenCalled();
    expect(mockReturning).toHaveBeenCalled();
  });

  it("should correctly insert new sunrise scores", async () => {
    const insertedRows = [
      {
        id: 1,
        locationId: 10,
        day: "2026-02-20",
        kind: "sunrise",
        type: "clear",
        score: 80,
        inputs: { humidity: 40 },
        computedAtMs: 1705400000000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    mockReturning.mockResolvedValue(insertedRows);

    const input: UpsertScoreInput[] = [
      {
        locationId: 10,
        day: "2026-02-20",
        kind: "sunrise",
        type: "clear",
        score: 80,
        computedAtMs: 1705400000000,
        inputs: { humidity: 40 },
      },
    ];

    const result = await upsertScores(mockDb, input);

    expect(result).toEqual(insertedRows);
    expect(mockValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          locationId: 10,
          day: "2026-02-20",
          kind: "sunrise",
          type: "clear",
          score: 80,
          inputs: { humidity: 40 },
        }),
      ]),
    );
  });

  it("should return empty array when given empty input", async () => {
    const result = await upsertScores(mockDb, []);

    expect(result).toEqual([]);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("should default inputs to empty object when not provided", async () => {
    mockReturning.mockResolvedValue([
      {
        id: 1,
        locationId: 42,
        day: "2026-01-15",
        kind: "sunset",
        type: "hazy",
        score: 30,
        inputs: {},
        computedAtMs: 1705300000000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const input: UpsertScoreInput[] = [
      {
        locationId: 42,
        day: "2026-01-15",
        kind: "sunset",
        type: "hazy",
        score: 30,
        computedAtMs: 1705300000000,
        // inputs not provided
      },
    ];

    await upsertScores(mockDb, input);

    expect(mockValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          inputs: {},
        }),
      ]),
    );
  });

  it("should handle multiple score types for same location/day/kind", async () => {
    const insertedRows = [
      { id: 1, type: "burning_sky", score: 70 },
      { id: 2, type: "gradient", score: 50 },
      { id: 3, type: "clear", score: 0 },
      { id: 4, type: "hazy", score: 0 },
    ];
    mockReturning.mockResolvedValue(insertedRows);

    const input: UpsertScoreInput[] = [
      { locationId: 42, day: "2026-01-15", kind: "sunset", type: "burning_sky", score: 70, computedAtMs: 1705300000000 },
      { locationId: 42, day: "2026-01-15", kind: "sunset", type: "gradient", score: 50, computedAtMs: 1705300000000 },
      { locationId: 42, day: "2026-01-15", kind: "sunset", type: "clear", score: 0, computedAtMs: 1705300000000 },
      { locationId: 42, day: "2026-01-15", kind: "sunset", type: "hazy", score: 0, computedAtMs: 1705300000000 },
    ];

    const result = await upsertScores(mockDb, input);

    expect(result).toHaveLength(4);
    expect(mockValues).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ type: "burning_sky" }),
      expect.objectContaining({ type: "gradient" }),
      expect.objectContaining({ type: "clear" }),
      expect.objectContaining({ type: "hazy" }),
    ]));
  });
});
