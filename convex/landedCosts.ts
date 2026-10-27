import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { choiceSetting } from "./settings";
import { round2 } from "./lib/fiscal";
import { setVariantCost, unitsOnHand } from "./lib/receiving";
import { shipmentReceipts } from "./lib/shipping";
import { formatVariantLabel, variantNames } from "./lib/variantNames";

const allocationMethodValidator = v.union(v.literal("VALUE"), v.literal("QUANTITY"));

async function componentsOf(ctx: QueryCtx, landedCostId: Id<"landedCosts">) {
  return await ctx.db
    .query("landedCostComponents")
    .withIndex("by_landed_cost", (q) => q.eq("landedCostId", landedCostId))
    .take(100);
}

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const costs = await ctx.db.query("landedCosts").order("desc").take(100);
    return await Promise.all(
      costs.map(async (cost) => {
        const components = await componentsOf(ctx, cost._id);
        const shipment = cost.shipmentId ? await ctx.db.get(cost.shipmentId) : null;
        const receipt = cost.receiptId ? await ctx.db.get(cost.receiptId) : null;
        const rawAllocations = await ctx.db
          .query("landedCostAllocations")
          .withIndex("by_landed_cost", (q) => q.eq("landedCostId", cost._id))
          .take(500);
        const allocations = await Promise.all(
          rawAllocations.map(async (a) => {
            const variant = await ctx.db.get(a.productVariantId);
            const product = variant ? await ctx.db.get(variant.productId) : null;
            return {
              ...a,
              label: variant
                ? `${product?.name ?? "—"} ${formatVariantLabel(await variantNames(ctx, variant), variant.sku)}`
                : "—",
            };
          })
        );
        return {
          ...cost,
          components,
          allocations,
          total: components.reduce((s, c) => s + c.componentValue, 0),
          shipmentLabel: shipment
            ? `${shipment.carrier}${shipment.trackingReference ? ` · ${shipment.trackingReference}` : ""}`
            : null,
          receiptNumber: receipt?.receiptNumber ?? null,
        };
      })
    );
  },
});

const componentsValidator = v.array(
  v.object({
    componentType: v.string(),
    value: v.number(),
  })
);

type ComponentInput = { componentType: string; value: number };

function validateComponents(components: ComponentInput[]) {
  if (components.length === 0) throw new Error("Add at least one cost component.");
  for (const c of components) {
    if (!c.componentType.trim()) throw new Error("Name each cost component.");
    if (c.value < 0) throw new Error("Costs cannot be negative.");
  }
}

/** Values are in the shop's currency (settings `currency` / `currencySymbol`), like every other amount. */
async function insertComponents(ctx: MutationCtx, landedCostId: Id<"landedCosts">, components: ComponentInput[]) {
  for (const c of components) {
    await ctx.db.insert("landedCostComponents", {
      landedCostId,
      componentType: c.componentType.trim(),
      componentValue: c.value,
    });
  }
}

async function deleteComponents(ctx: MutationCtx, landedCostId: Id<"landedCosts">) {
  for (const c of await componentsOf(ctx, landedCostId)) await ctx.db.delete(c._id);
}

/** A landed cost is for one shipment or one receipt (or neither yet), never both. */
async function checkTarget(
  ctx: MutationCtx,
  shipmentId: Id<"shipments"> | undefined,
  receiptId: Id<"purchaseReceipts"> | undefined
) {
  if (shipmentId && receiptId) throw new Error("Link the cost to a shipment or to a receipt, not both.");
  if (shipmentId && !(await ctx.db.get(shipmentId))) throw new Error("Shipment not found.");
  if (receiptId && !(await ctx.db.get(receiptId))) throw new Error("Receipt not found.");
}

async function loadEditable(ctx: MutationCtx, id: Id<"landedCosts">) {
  const cost = await ctx.db.get(id);
  if (!cost) throw new Error("Landed cost not found.");
  if (cost.appliedAt) {
    throw new Error("This landed cost is already in the cost prices and can no longer be changed.");
  }
  return cost;
}

const targetArgs = {
  shipmentId: v.optional(v.id("shipments")),
  receiptId: v.optional(v.id("purchaseReceipts")),
  allocationMethod: v.optional(allocationMethodValidator),
};

/** One landed-cost calculation: the goods plus freight, insurance, duties and handling. */
export const create = mutation({
  args: {
    token: v.string(),
    calculatedFor: v.number(),
    methodVersion: v.optional(v.string()),
    components: componentsValidator,
    ...targetArgs,
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    validateComponents(args.components);
    await checkTarget(ctx, args.shipmentId, args.receiptId);
    const id = await ctx.db.insert("landedCosts", {
      calculatedFor: args.calculatedFor,
      methodVersion: args.methodVersion?.trim() || "manual",
      shipmentId: args.shipmentId,
      receiptId: args.receiptId,
      allocationMethod: args.allocationMethod ?? "VALUE",
    });
    await insertComponents(ctx, id, args.components);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "landed_cost.recorded",
      entityType: "landedCost",
      entityId: id,
      details: `${args.components.length} component(s)`,
    });
    return id;
  },
});

/** Edit a calculation: date, method, link and the full list of cost components (replaced wholesale). */
export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("landedCosts"),
    calculatedFor: v.number(),
    methodVersion: v.optional(v.string()),
    components: componentsValidator,
    ...targetArgs,
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    await loadEditable(ctx, args.id);
    validateComponents(args.components);
    await checkTarget(ctx, args.shipmentId, args.receiptId);
    await ctx.db.patch(args.id, {
      calculatedFor: args.calculatedFor,
      methodVersion: args.methodVersion?.trim() || "manual",
      shipmentId: args.shipmentId,
      receiptId: args.receiptId,
      allocationMethod: args.allocationMethod ?? "VALUE",
    });
    await deleteComponents(ctx, args.id);
    await insertComponents(ctx, args.id, args.components);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "landed_cost.updated",
      entityType: "landedCost",
      entityId: args.id,
      details: `${args.components.length} component(s)`,
    });
    return null;
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("landedCosts") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    await loadEditable(ctx, args.id);
    await deleteComponents(ctx, args.id);
    await ctx.db.delete(args.id);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "landed_cost.deleted",
      entityType: "landedCost",
      entityId: args.id,
    });
    return null;
  },
});

/** The receipt lines a landed cost is spread over: its receipt's, or every receipt from its shipment. */
async function linesToAllocate(ctx: MutationCtx, cost: Doc<"landedCosts">) {
  let receipts: Doc<"purchaseReceipts">[] = [];
  if (cost.receiptId) {
    const receipt = await ctx.db.get(cost.receiptId);
    if (receipt) receipts = [receipt];
  } else if (cost.shipmentId) {
    const shipment = await ctx.db.get(cost.shipmentId);
    if (shipment) receipts = await shipmentReceipts(ctx, shipment);
  } else {
    throw new Error("Link this cost to a shipment or a receipt before applying it.");
  }
  const lines: Doc<"purchaseReceiptItems">[] = [];
  for (const r of receipts) {
    lines.push(
      ...(await ctx.db
        .query("purchaseReceiptItems")
        .withIndex("by_receipt", (q) => q.eq("receiptId", r._id))
        .take(500))
    );
  }
  if (lines.length === 0) throw new Error("No goods have been received for it yet.");
  return lines;
}

/**
 * Spreads a landed cost over the goods it was for and adds it to their cost price.
 * Each receipt line gets a share by its goods value (quantity × unit cost) or by units;
 * the last line takes the rounding remainder. The cost price then rises by the costMethod
 * setting:
 *  - WEIGHTED_AVERAGE: the share is added to the value of the stock on hand
 *    (cost + share ÷ units on hand); with nothing left on hand it no longer changes a cost;
 *  - LATEST: the share per unit is added to the current cost;
 *  - MANUAL: unchanged (the allocation is still recorded).
 * Once applied the landed cost is locked.
 */
export const apply = mutation({
  args: { token: v.string(), id: v.id("landedCosts") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const cost = await loadEditable(ctx, args.id);
    const total = round2((await componentsOf(ctx, cost._id)).reduce((s, c) => s + c.componentValue, 0));
    if (total <= 0) throw new Error("There is no cost to apply.");
    const lines = await linesToAllocate(ctx, cost);

    const byValue = (cost.allocationMethod ?? "VALUE") === "VALUE";
    let weights = lines.map((l) => (byValue ? l.quantityReceived * l.unitCost : l.quantityReceived));
    // Goods received at no cost have no value to spread by: fall back to units.
    if (weights.reduce((s, w) => s + w, 0) <= 0) weights = lines.map((l) => l.quantityReceived);
    const weightTotal = weights.reduce((s, w) => s + w, 0);

    let given = 0;
    const perVariant = new Map<Id<"productVariants">, { amount: number; quantity: number }>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const amount = i === lines.length - 1 ? round2(total - given) : round2((total * weights[i]) / weightTotal);
      given = round2(given + amount);
      await ctx.db.insert("landedCostAllocations", {
        landedCostId: cost._id,
        receiptItemId: line._id,
        productVariantId: line.productVariantId,
        quantity: line.quantityReceived,
        amount,
        unitAmount: line.quantityReceived > 0 ? round2(amount / line.quantityReceived) : 0,
      });
      const prev = perVariant.get(line.productVariantId) ?? { amount: 0, quantity: 0 };
      perVariant.set(line.productVariantId, {
        amount: prev.amount + amount,
        quantity: prev.quantity + line.quantityReceived,
      });
    }

    const method = await choiceSetting(ctx, "costMethod");
    if (method !== "MANUAL") {
      for (const [variantId, share] of perVariant) {
        const variant = await ctx.db.get(variantId);
        if (!variant) continue;
        let newCost = variant.costPrice;
        if (method === "WEIGHTED_AVERAGE") {
          const onHand = await unitsOnHand(ctx, variantId);
          if (onHand > 0) newCost = variant.costPrice + share.amount / onHand;
        } else if (share.quantity > 0) {
          newCost = variant.costPrice + share.amount / share.quantity;
        }
        await setVariantCost(ctx, actor, variant, newCost, `landed cost ${round2(share.amount)}`);
      }
    }

    await ctx.db.patch(cost._id, { appliedAt: Date.now() });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "landed_cost.applied",
      entityType: "landedCost",
      entityId: cost._id,
      details: `${total} over ${lines.length} receipt line(s), by ${byValue ? "value" : "units"}`,
    });
    return null;
  },
});
