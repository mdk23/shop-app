import { MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

export type DocumentType = Doc<"documentSeries">["documentType"];

/** Prefix of each document's number, e.g. "FT-0042". */
const PREFIX: Record<DocumentType, string> = {
  SALE: "FT",
  RETURN: "NC",
  PURCHASE_ORDER: "PO",
  PURCHASE_RECEIPT: "RC",
  TRANSFER: "TR",
  CUSTOMER_ORDER: "CE",
};

/**
 * Every code the app makes has one shape: PREFIX-#### ("FT-0042", "CLI-0007"). At least
 * four digits; past 9999 it simply grows ("FT-10000").
 */
export function formatCode(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

/**
 * The one source of document numbers: the next gapless number in the document type's
 * series, e.g. "FT-0042". One continuous series per type (it never restarts, so a number
 * is never used twice). Must run inside the mutation that creates the document: Convex
 * rolls the whole mutation back on error, so a failed document never leaves a gap.
 */
export async function nextDocumentNumber(
  ctx: MutationCtx,
  documentType: DocumentType,
  now: number = Date.now()
): Promise<string> {
  let series = await ctx.db
    .query("documentSeries")
    .withIndex("by_type", (q) => q.eq("documentType", documentType))
    .unique();

  if (!series) {
    const seriesId = await ctx.db.insert("documentSeries", {
      documentType,
      prefix: PREFIX[documentType],
      lastNumber: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    series = (await ctx.db.get(seriesId))!;
  }

  const lastNumber = series.lastNumber + 1;
  await ctx.db.patch(series._id, { lastNumber, updatedAt: now });
  return formatCode(series.prefix, lastNumber);
}
