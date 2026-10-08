import { MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

export type DocumentType = Doc<"documentSeries">["documentType"];

/** Prefix of each document's number, e.g. "FT 2026/000042". */
const PREFIX: Record<DocumentType, string> = {
  SALE: "FT",
  RETURN: "NC",
  PURCHASE_ORDER: "PO",
  PURCHASE_RECEIPT: "RC",
  TRANSFER: "TR",
  CUSTOMER_ORDER: "CE",
};

/**
 * The one source of document numbers: the next gapless number in the document type's
 * series for the year, e.g. "FT 2026/000042". Must run inside the mutation that creates
 * the document: Convex rolls the whole mutation back on error, so a failed document
 * never leaves a gap in its series.
 */
export async function nextDocumentNumber(
  ctx: MutationCtx,
  documentType: DocumentType,
  now: number = Date.now()
): Promise<string> {
  const fiscalYear = new Date(now).getFullYear();
  let series = await ctx.db
    .query("documentSeries")
    .withIndex("by_type_year", (q) =>
      q.eq("documentType", documentType).eq("fiscalYear", fiscalYear)
    )
    .unique();

  if (!series) {
    const seriesId = await ctx.db.insert("documentSeries", {
      documentType,
      prefix: PREFIX[documentType],
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
  return `${series.prefix} ${fiscalYear}/${String(lastNumber).padStart(6, "0")}`;
}
