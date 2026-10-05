import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

const PREFIX_BY_TYPE = { SALE: "FT", RETURN: "NC" } as const;

export const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Takes the next gapless fiscal number for a document type in a fiscal year.
 * Must run inside the mutation that creates the document: Convex rolls the whole
 * mutation back on error, so a failed sale never leaves a gap in the series.
 */
export async function nextFiscalNumber(
  ctx: MutationCtx,
  documentType: "SALE" | "RETURN",
  fiscalYear: number,
  now: number = Date.now()
): Promise<{ seriesId: Id<"documentSeries">; fiscalNumber: string }> {
  let series = await ctx.db
    .query("documentSeries")
    .withIndex("by_type_year", (q) =>
      q.eq("documentType", documentType).eq("fiscalYear", fiscalYear)
    )
    .unique();

  if (!series) {
    const seriesId = await ctx.db.insert("documentSeries", {
      documentType,
      prefix: PREFIX_BY_TYPE[documentType],
      fiscalYear,
      lastNumber: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    series = (await ctx.db.get(seriesId))!;
  }

  const lastNumber = series.lastNumber + 1;
  await ctx.db.patch(series._id, { lastNumber, updatedAt: now });
  return {
    seriesId: series._id,
    fiscalNumber: `${series.prefix} ${fiscalYear}/${String(lastNumber).padStart(6, "0")}`,
  };
}
