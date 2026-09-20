import { subMonths as dateFnsSubMonths } from "date-fns";

/**
 * Pure, Convex-free customer-profile derivation logic: size inference and
 * tier computation. Kept free of `ctx`/database types so it's testable with
 * plain data and importable directly from `performSale` (see
 * `convex/customerProfile.ts`), which needs it inside the same transaction
 * as the sale write.
 */

export type SaleStatus =
  | "COMPLETED"
  | "PARTIALLY_PAID"
  | "PENDING"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type SizeObservation = {
  saleId: string;
  saleItemId: string;
  createdAt: number; // ms epoch
  saleStatus: SaleStatus;
  categoryId: string;
  categoryName: string;
  sizeId: string;
  sizeName: string;
  gender?: "women" | "men" | "unisex";
  colorName?: string;
  quantity: number;
  returnedQuantity: number;
};

export type ExistingProfileRow = {
  categoryId: string;
  sizeId: string;
  confidence: "CONFIRMADO" | "INFERIDO";
};

export type InferredProfile = {
  categoryId: string;
  sizeId: string;
  sizeName: string;
  confidence: "INFERIDO";
  score: number; // net units backing the winner — debugging/tests only
};

/** Real calendar-month subtraction (not 30-day approximation). */
export function subMonths(ts: number, months: number): number {
  return dateFnsSubMonths(new Date(ts), months).getTime();
}

function netUnits(o: SizeObservation): number {
  return o.quantity - o.returnedQuantity;
}

/**
 * Infers the most likely size per category from sale history:
 *   1. Drop CANCELLED sales.
 *   2. Drop observations older than `windowMonths` (default 24).
 *   3. Net out returned units — a fully-returned line contributes nothing,
 *      a partially-returned line contributes only the kept units. This is
 *      the "a returned item shouldn't cement a size" rule.
 *   4. Group by category; sum net units per size within a group.
 *   5. Skip any group where `existing` already has a CONFIRMADO row —
 *      confirmed sizes are never overwritten by inference.
 *   6. Winner = highest net-unit sum; ties broken by most recent purchase,
 *      then by lexicographically smallest sizeId (for determinism).
 */
export function inferSizeProfile(
  observations: SizeObservation[],
  existing: ExistingProfileRow[],
  opts: { now: number; windowMonths?: number }
): InferredProfile[] {
  const windowStart = subMonths(opts.now, opts.windowMonths ?? 24);
  const confirmedCategories = new Set(
    existing.filter((r) => r.confidence === "CONFIRMADO").map((r) => r.categoryId)
  );

  const active = observations.filter(
    (o) =>
      o.saleStatus !== "CANCELLED" &&
      o.createdAt >= windowStart &&
      netUnits(o) > 0 &&
      !confirmedCategories.has(o.categoryId)
  );

  type Tally = { net: number; lastSeen: number; sizeName: string };
  const byCategory = new Map<string, Map<string, Tally>>();

  for (const o of active) {
    let bySizeId = byCategory.get(o.categoryId);
    if (!bySizeId) {
      bySizeId = new Map();
      byCategory.set(o.categoryId, bySizeId);
    }
    const prev = bySizeId.get(o.sizeId);
    const net = netUnits(o);
    if (prev) {
      prev.net += net;
      if (o.createdAt > prev.lastSeen) prev.lastSeen = o.createdAt;
    } else {
      bySizeId.set(o.sizeId, { net, lastSeen: o.createdAt, sizeName: o.sizeName });
    }
  }

  const results: InferredProfile[] = [];
  for (const [categoryId, bySizeId] of byCategory) {
    let winnerSizeId: string | null = null;
    let winner: Tally | null = null;
    for (const [sizeId, tally] of bySizeId) {
      if (
        !winner ||
        tally.net > winner.net ||
        (tally.net === winner.net && tally.lastSeen > winner.lastSeen) ||
        (tally.net === winner.net &&
          tally.lastSeen === winner.lastSeen &&
          sizeId < (winnerSizeId as string))
      ) {
        winner = tally;
        winnerSizeId = sizeId;
      }
    }
    if (winner && winnerSizeId) {
      results.push({
        categoryId,
        sizeId: winnerSizeId,
        sizeName: winner.sizeName,
        confidence: "INFERIDO",
        score: winner.net,
      });
    }
  }
  return results;
}

/**
 * Majority-vote gender preference over non-cancelled, non-fully-returned
 * observations, ignoring "unisex" votes (they carry no directional signal).
 * Returns undefined when there's no signal or a tie.
 */
export function inferGender(
  observations: SizeObservation[]
): "women" | "men" | "unisex" | undefined {
  const counts = { women: 0, men: 0 };
  for (const o of observations) {
    if (o.saleStatus === "CANCELLED") continue;
    if (netUnits(o) <= 0) continue;
    if (o.gender === "women") counts.women += netUnits(o);
    else if (o.gender === "men") counts.men += netUnits(o);
  }
  if (counts.women === 0 && counts.men === 0) return undefined;
  if (counts.women === counts.men) return undefined;
  return counts.women > counts.men ? "women" : "men";
}

/**
 * Tier 3 — "what does this customer buy most" — generic over any labeled
 * observation (category name, color name, ...). Never a form field: this is
 * always derived from `net` (quantity minus returned) across sale history,
 * same "a returned item doesn't count" rule as size inference. No window —
 * this answers "most bought, ever (within the scanned history)", not
 * "recently bought", so it doesn't reset just because a customer's favorite
 * purchases happened more than a couple of years ago.
 */
export function topLabel(
  entries: { label: string | undefined; net: number }[]
): string | undefined {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (!e.label || e.net <= 0) continue;
    totals.set(e.label, (totals.get(e.label) ?? 0) + e.net);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [label, count] of totals) {
    if (count > bestCount || (count === bestCount && best !== undefined && label < best)) {
      best = label;
      bestCount = count;
    }
  }
  return best;
}

export type Tier = "NOVO" | "REGULAR" | "VIP";
export type TierStats = { saleCount: number; spendTrailing12m: number };
export type TierThresholds = { novoMaxSales: number; vipMinSpend12m: number };

/**
 * NOVO is checked before VIP: a customer's very first purchase is always
 * NOVO regardless of size, even a large one-off (spec-literal ordering).
 */
export function computeTier(stats: TierStats, thresholds: TierThresholds): Tier {
  if (stats.saleCount <= thresholds.novoMaxSales) return "NOVO";
  if (stats.spendTrailing12m >= thresholds.vipMinSpend12m) return "VIP";
  return "REGULAR";
}
