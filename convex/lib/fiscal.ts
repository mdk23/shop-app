import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whose tax number: a customer or a supplier. */
export type NuitOwner = { customerId: Id<"customers"> } | { supplierId: Id<"suppliers"> };

async function identitiesOf(ctx: QueryCtx | MutationCtx, owner: NuitOwner) {
  return "customerId" in owner
    ? await ctx.db
        .query("fiscalIdentities")
        .withIndex("by_customer", (q) => q.eq("customerId", owner.customerId))
        .collect()
    : await ctx.db
        .query("fiscalIdentities")
        .withIndex("by_supplier", (q) => q.eq("supplierId", owner.supplierId))
        .collect();
}

/** The owner's open NUIT, if one is recorded in fiscalIdentities. */
export async function currentNuitOf(
  ctx: QueryCtx | MutationCtx,
  owner: NuitOwner
): Promise<string | undefined> {
  const rows = await identitiesOf(ctx, owner);
  return rows.find((r) => r.identificationType === "NUIT" && r.validTo === undefined)?.number;
}

/** The customer's open NUIT, if one is recorded in fiscalIdentities. */
export async function currentNuit(
  ctx: QueryCtx | MutationCtx,
  customerId: Id<"customers">
): Promise<string | undefined> {
  return await currentNuitOf(ctx, { customerId });
}

/**
 * Records a NUIT for the owner and closes the previous one, keeping history. A NUIT has
 * nine digits; recording the current number again changes nothing.
 */
export async function recordNuit(ctx: MutationCtx, owner: NuitOwner, rawNumber: string) {
  const number = rawNumber.trim();
  if (!/^\d{9}$/.test(number)) throw new Error("A NUIT has nine digits.");
  const now = Date.now();
  for (const row of await identitiesOf(ctx, owner)) {
    if (row.identificationType === "NUIT" && row.validTo === undefined) {
      if (row.number === number) return row._id;
      await ctx.db.patch(row._id, { validTo: now });
    }
  }
  return await ctx.db.insert("fiscalIdentities", {
    ...owner,
    identificationType: "NUIT",
    number,
    country: "MZ",
    validFrom: now,
  });
}
