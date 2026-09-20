import { describe, expect, test } from "vitest";
import {
  inferSizeProfile,
  inferGender,
  computeTier,
  topLabel,
  subMonths,
  type SizeObservation,
  type ExistingProfileRow,
} from "./derive";

const NOW = new Date("2026-06-15T12:00:00Z").getTime();
const CAT_SHIRTS = "cat_shirts";
const CAT_PANTS = "cat_pants";
const SIZE_M = "size_m";
const SIZE_L = "size_l";

function obs(overrides: Partial<SizeObservation> = {}): SizeObservation {
  return {
    saleId: "sale_1",
    saleItemId: `item_${Math.random()}`,
    createdAt: NOW,
    saleStatus: "COMPLETED",
    categoryId: CAT_SHIRTS,
    categoryName: "T-Shirts",
    sizeId: SIZE_M,
    sizeName: "M",
    quantity: 1,
    returnedQuantity: 0,
    ...overrides,
  };
}

describe("inferSizeProfile", () => {
  test("happy path: most frequent size wins", () => {
    const observations = [
      obs({ sizeId: SIZE_M, sizeName: "M" }),
      obs({ sizeId: SIZE_M, sizeName: "M" }),
      obs({ sizeId: SIZE_M, sizeName: "M" }),
      obs({ sizeId: SIZE_L, sizeName: "L" }),
    ];
    const result = inferSizeProfile(observations, [], { now: NOW });
    expect(result).toEqual([
      { categoryId: CAT_SHIRTS, sizeId: SIZE_M, sizeName: "M", confidence: "INFERIDO", score: 3 },
    ]);
  });

  test("CONFIRMADO row overrides inference — nothing emitted for that group", () => {
    const observations = [
      obs({ sizeId: SIZE_L, sizeName: "L" }),
      obs({ sizeId: SIZE_L, sizeName: "L" }),
      obs({ sizeId: SIZE_L, sizeName: "L" }),
    ];
    const existing: ExistingProfileRow[] = [
      { categoryId: CAT_SHIRTS, sizeId: SIZE_M, confidence: "CONFIRMADO" },
    ];
    const result = inferSizeProfile(observations, existing, { now: NOW });
    expect(result).toEqual([]);
  });

  test("INFERIDO existing row is overwritable", () => {
    const observations = [
      obs({ sizeId: SIZE_L, sizeName: "L" }),
      obs({ sizeId: SIZE_L, sizeName: "L" }),
    ];
    const existing: ExistingProfileRow[] = [
      { categoryId: CAT_SHIRTS, sizeId: SIZE_M, confidence: "INFERIDO" },
    ];
    const result = inferSizeProfile(observations, existing, { now: NOW });
    expect(result).toEqual([
      { categoryId: CAT_SHIRTS, sizeId: SIZE_L, sizeName: "L", confidence: "INFERIDO", score: 2 },
    ]);
  });

  test("a fully-returned line never cements a size", () => {
    const observations = [
      obs({ sizeId: SIZE_M, quantity: 4, returnedQuantity: 4 }),
    ];
    const result = inferSizeProfile(observations, [], { now: NOW });
    expect(result).toEqual([]);
  });

  test("a partial return can flip the winner", () => {
    const observations = [
      obs({ sizeId: SIZE_M, sizeName: "M", quantity: 3, returnedQuantity: 2 }), // net 1
      obs({ sizeId: SIZE_L, sizeName: "L", quantity: 2, returnedQuantity: 0 }), // net 2
    ];
    const result = inferSizeProfile(observations, [], { now: NOW });
    expect(result).toEqual([
      { categoryId: CAT_SHIRTS, sizeId: SIZE_L, sizeName: "L", confidence: "INFERIDO", score: 2 },
    ]);
  });

  test("frequency tie is broken by most recent purchase", () => {
    const older = NOW - 1000;
    const newer = NOW;
    const observations = [
      obs({ sizeId: SIZE_M, sizeName: "M", createdAt: older }),
      obs({ sizeId: SIZE_M, sizeName: "M", createdAt: older }),
      obs({ sizeId: SIZE_L, sizeName: "L", createdAt: newer }),
      obs({ sizeId: SIZE_L, sizeName: "L", createdAt: newer }),
    ];
    const result = inferSizeProfile(observations, [], { now: NOW });
    expect(result[0].sizeId).toBe(SIZE_L);
  });

  test("frequency + recency tie is still deterministic across invocations", () => {
    const observations = [
      obs({ sizeId: SIZE_M, sizeName: "M", createdAt: NOW }),
      obs({ sizeId: SIZE_L, sizeName: "L", createdAt: NOW }),
    ];
    const first = inferSizeProfile(observations, [], { now: NOW });
    const second = inferSizeProfile(observations, [], { now: NOW });
    expect(first).toEqual(second);
    // smallest sizeId lexicographically wins the tie
    expect(first[0].sizeId).toBe(SIZE_L < SIZE_M ? SIZE_L : SIZE_M);
  });

  test("window boundary: exactly 24 months ago is included, one ms older is excluded", () => {
    const boundary = subMonths(NOW, 24);
    const observations = [
      obs({ sizeId: SIZE_M, createdAt: boundary }),
      obs({ sizeId: SIZE_L, createdAt: boundary - 1 }),
    ];
    const result = inferSizeProfile(observations, [], { now: NOW, windowMonths: 24 });
    expect(result).toEqual([
      { categoryId: CAT_SHIRTS, sizeId: SIZE_M, sizeName: "M", confidence: "INFERIDO", score: 1 },
    ]);
  });

  test("window boundary holds across a leap year", () => {
    const leapNow = new Date("2028-03-01T00:00:00Z").getTime();
    const boundary = subMonths(leapNow, 24); // spans Feb 2028 (leap) and Feb 2027
    const observations = [
      obs({ sizeId: SIZE_M, createdAt: boundary }),
      obs({ sizeId: SIZE_L, createdAt: boundary - 1 }),
    ];
    const result = inferSizeProfile(observations, [], { now: leapNow, windowMonths: 24 });
    expect(result.map((r) => r.sizeId)).toEqual([SIZE_M]);
  });

  test("CANCELLED sales are excluded even if in-window and non-returned", () => {
    const observations = [obs({ sizeId: SIZE_M, saleStatus: "CANCELLED" })];
    const result = inferSizeProfile(observations, [], { now: NOW });
    expect(result).toEqual([]);
  });

  test("multiple categories are inferred independently", () => {
    const observations = [
      obs({ categoryId: CAT_SHIRTS, sizeId: SIZE_M, sizeName: "M" }),
      obs({ categoryId: CAT_PANTS, sizeId: SIZE_L, sizeName: "L" }),
    ];
    const result = inferSizeProfile(observations, [], { now: NOW });
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.categoryId === CAT_SHIRTS)?.sizeId).toBe(SIZE_M);
    expect(result.find((r) => r.categoryId === CAT_PANTS)?.sizeId).toBe(SIZE_L);
  });

  test("empty input returns an empty array without throwing", () => {
    expect(inferSizeProfile([], [], { now: NOW })).toEqual([]);
  });
});

describe("computeTier", () => {
  const thresholds = { novoMaxSales: 1, vipMinSpend12m: 50000 };

  test("0 sales is NOVO", () => {
    expect(computeTier({ saleCount: 0, spendTrailing12m: 0 }, thresholds)).toBe("NOVO");
  });

  test("exactly novoMaxSales (1) is still NOVO", () => {
    expect(computeTier({ saleCount: 1, spendTrailing12m: 0 }, thresholds)).toBe("NOVO");
  });

  test("just past the NOVO boundary (2 sales), below VIP spend, is REGULAR", () => {
    expect(computeTier({ saleCount: 2, spendTrailing12m: 100 }, thresholds)).toBe("REGULAR");
  });

  test("spend exactly at the VIP threshold is VIP (>=, not >)", () => {
    expect(computeTier({ saleCount: 5, spendTrailing12m: 50000 }, thresholds)).toBe("VIP");
  });

  test("one metical below the VIP threshold is REGULAR", () => {
    expect(computeTier({ saleCount: 5, spendTrailing12m: 49999 }, thresholds)).toBe("REGULAR");
  });

  test("NOVO is checked before VIP — a huge first purchase is still NOVO", () => {
    expect(computeTier({ saleCount: 1, spendTrailing12m: 500000 }, thresholds)).toBe("NOVO");
  });

  test("thresholds always come from args, never constants", () => {
    const stats = { saleCount: 3, spendTrailing12m: 1000 };
    expect(computeTier(stats, { novoMaxSales: 1, vipMinSpend12m: 500 })).toBe("VIP");
    expect(computeTier(stats, { novoMaxSales: 1, vipMinSpend12m: 5000 })).toBe("REGULAR");
  });
});

describe("inferGender", () => {
  test("majority of women observations wins", () => {
    const observations = [
      obs({ gender: "women" }),
      obs({ gender: "women" }),
      obs({ gender: "women" }),
      obs({ gender: "men" }),
    ];
    expect(inferGender(observations)).toBe("women");
  });

  test("all unisex yields no signal", () => {
    const observations = [obs({ gender: "unisex" }), obs({ gender: "unisex" })];
    expect(inferGender(observations)).toBeUndefined();
  });

  test("a tie yields no signal", () => {
    const observations = [obs({ gender: "women" }), obs({ gender: "men" })];
    expect(inferGender(observations)).toBeUndefined();
  });
});

describe("topLabel", () => {
  test("most frequent label wins", () => {
    const entries = [
      { label: "T-Shirts", net: 3 },
      { label: "Pants", net: 1 },
    ];
    expect(topLabel(entries)).toBe("T-Shirts");
  });

  test("net units are summed across multiple entries of the same label", () => {
    const entries = [
      { label: "Black", net: 1 },
      { label: "Black", net: 1 },
      { label: "White", net: 1 },
    ];
    expect(topLabel(entries)).toBe("Black");
  });

  test("a fully-returned entry (net <= 0) never wins", () => {
    const entries = [
      { label: "Black", net: 0 },
      { label: "White", net: 1 },
    ];
    expect(topLabel(entries)).toBe("White");
  });

  test("undefined labels are ignored", () => {
    const entries = [
      { label: undefined, net: 5 },
      { label: "White", net: 1 },
    ];
    expect(topLabel(entries)).toBe("White");
  });

  test("a tie is broken lexicographically for determinism", () => {
    const entries = [
      { label: "White", net: 2 },
      { label: "Black", net: 2 },
    ];
    expect(topLabel(entries)).toBe("Black");
  });

  test("empty input returns undefined", () => {
    expect(topLabel([])).toBeUndefined();
  });
});
