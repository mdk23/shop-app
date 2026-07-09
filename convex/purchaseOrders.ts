import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { validateToken } from "./auth";

// List all purchase orders (optimized with index)
export const list = query({
  args: {
    supplierId: v.optional(v.id("suppliers")),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("sent"),
        v.literal("partially_received"),
        v.literal("completed"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    // 1. If status is provided, query by status index
    if (args.status) {
      let q = ctx.db
        .query("purchaseOrders")
        .withIndex("by_status", (q) => q.eq("status", args.status!));
      if (args.supplierId) {
        return (await q.collect()).filter((po) => po.supplierId === args.supplierId);
      }
      return await q.collect();
    }

    // 2. If supplierId is provided, query by supplier index
    if (args.supplierId) {
      return await ctx.db
        .query("purchaseOrders")
        .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId!))
        .collect();
    }

    // 3. Fallback: return all orders ordered by creation time
    return await ctx.db.query("purchaseOrders").order("desc").collect();
  },
});

// Fetch a single purchase order along with its items and supplier details
export const get = query({
  args: {
    id: v.id("purchaseOrders"),
  },
  handler: async (ctx, args) => {
    const po = await ctx.db.get(args.id);
    if (!po) return null;

    const supplier = await ctx.db.get(po.supplierId);
    const items = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", po._id))
      .collect();

    // Fetch ingredient names dynamically to avoid storing stale names in item document
    const itemsWithDetails = await Promise.all(
      items.map(async (item) => {
        const ingredient = await ctx.db.get(item.ingredientId);
        return {
          ...item,
          ingredientName: ingredient?.name || "Unknown Ingredient",
          ingredientUnit: ingredient?.unit || "pcs",
        };
      })
    );

    return {
      ...po,
      supplierName: supplier?.name || "Unknown Supplier",
      items: itemsWithDetails,
    };
  },
});

// Create a new purchase order draft
export const create = mutation({
  args: {
    token: v.string(),
    supplierId: v.id("suppliers"),
    orderDate: v.number(),
    expectedDeliveryDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        ingredientId: v.id("ingredients"),
        quantityOrdered: v.number(),
        unitCost: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await validateToken(ctx, args.token);

    // 1. Calculate order total
    let totalAmount = 0;
    for (const item of args.items) {
      totalAmount += item.quantityOrdered * item.unitCost;
    }

    // 2. Generate daily purchase order code (PO-DD.MM.YY-XXX)
    const now = Date.now();
    const localTime = new Date(now + 7200000); // UTC+2 Maputo timezone
    const day = String(localTime.getUTCDate()).padStart(2, "0");
    const month = String(localTime.getUTCMonth() + 1).padStart(2, "0");
    const year = String(localTime.getUTCFullYear()).slice(-2);
    const dateString = `${day}.${month}.${year}`; // e.g. "09.07.26"

    let sequenceNumber = 1;
    const counter = await ctx.db
      .query("counters")
      .withIndex("by_key", (q) => q.eq("key", "purchase_order_sequence"))
      .first();

    if (!counter) {
      await ctx.db.insert("counters", {
        key: "purchase_order_sequence",
        value: 1,
        dateString,
        updatedAt: now,
      });
    } else {
      if (counter.dateString !== dateString) {
        // Reset counter for new day
        sequenceNumber = 1;
        await ctx.db.patch(counter._id, {
          value: 1,
          dateString,
          updatedAt: now,
        });
      } else {
        sequenceNumber = counter.value + 1;
        await ctx.db.patch(counter._id, {
          value: sequenceNumber,
          updatedAt: now,
        });
      }
    }

    const orderCode = `PO-${dateString}-${String(sequenceNumber).padStart(3, "0")}`;

    // 3. Insert Purchase Order document
    const purchaseOrderId = await ctx.db.insert("purchaseOrders", {
      supplierId: args.supplierId,
      orderCode,
      orderDate: args.orderDate,
      expectedDeliveryDate: args.expectedDeliveryDate,
      status: "draft",
      paymentStatus: "unpaid",
      totalAmount,
      notes: args.notes,
      createdAt: now,
    });

    // 4. Insert items
    for (const item of args.items) {
      await ctx.db.insert("purchaseOrderItems", {
        purchaseOrderId,
        ingredientId: item.ingredientId,
        quantityOrdered: item.quantityOrdered,
        quantityReceived: 0, // initially 0 in draft/sent phase
        unitCost: item.unitCost,
        totalCost: item.quantityOrdered * item.unitCost,
      });
    }

    return purchaseOrderId;
  },
});

// Update an existing draft PO
export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("purchaseOrders"),
    supplierId: v.id("suppliers"),
    orderDate: v.number(),
    expectedDeliveryDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        ingredientId: v.id("ingredients"),
        quantityOrdered: v.number(),
        unitCost: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await validateToken(ctx, args.token);

    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found");
    if (po.status !== "draft") throw new Error("Can only modify draft purchase orders");

    // 1. Calculate new order total
    let totalAmount = 0;
    for (const item of args.items) {
      totalAmount += item.quantityOrdered * item.unitCost;
    }

    // 2. Update PO Header
    await ctx.db.patch(args.id, {
      supplierId: args.supplierId,
      orderDate: args.orderDate,
      expectedDeliveryDate: args.expectedDeliveryDate,
      totalAmount,
      notes: args.notes,
    });

    // 3. Remove existing items and insert updated items
    const existingItems = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", args.id))
      .collect();

    for (const item of existingItems) {
      await ctx.db.delete(item._id);
    }

    for (const item of args.items) {
      await ctx.db.insert("purchaseOrderItems", {
        purchaseOrderId: args.id,
        ingredientId: item.ingredientId,
        quantityOrdered: item.quantityOrdered,
        quantityReceived: 0,
        unitCost: item.unitCost,
        totalCost: item.quantityOrdered * item.unitCost,
      });
    }

    return args.id;
  },
});

// Update Status (Transitions: draft -> sent -> cancelled)
export const updateStatus = mutation({
  args: {
    token: v.string(),
    id: v.id("purchaseOrders"),
    status: v.union(v.literal("sent"), v.literal("cancelled")),
  },
  handler: async (ctx, args) => {
    await validateToken(ctx, args.token);

    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found");

    if (args.status === "sent" && po.status !== "draft") {
      throw new Error("Can only transition to 'sent' from 'draft'");
    }
    if (args.status === "cancelled" && (po.status === "completed" || po.status === "partially_received")) {
      throw new Error("Cannot cancel a received purchase order");
    }

    await ctx.db.patch(args.id, { status: args.status });
    return args.id;
  },
});

// Delete a PO (Only allowed if still draft)
export const remove = mutation({
  args: {
    token: v.string(),
    id: v.id("purchaseOrders"),
  },
  handler: async (ctx, args) => {
    await validateToken(ctx, args.token);

    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found");
    if (po.status !== "draft") throw new Error("Can only delete draft purchase orders");

    // Remove PO Items first
    const items = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", po._id))
      .collect();

    for (const item of items) {
      await ctx.db.delete(item._id);
    }

    // Delete PO document
    await ctx.db.delete(po._id);
    return args.id;
  },
});

// Receive items and increment stock levels via mutateStock engine
export const receiveItems = mutation({
  args: {
    token: v.string(),
    id: v.id("purchaseOrders"),
    items: v.array(
      v.object({
        ingredientId: v.id("ingredients"),
        quantityReceived: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await validateToken(ctx, args.token);

    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found");
    if (po.status !== "sent" && po.status !== "partially_received") {
      throw new Error("Can only receive items for sent or partially received purchase orders");
    }

    // 1. Fetch all items in this PO
    const poItems = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", po._id))
      .collect();

    // 2. Loop through each received item
    for (const rxItem of args.items) {
      if (rxItem.quantityReceived <= 0) continue;

      const itemDoc = poItems.find((i) => i.ingredientId === rxItem.ingredientId);
      if (!itemDoc) {
        throw new Error(`Ingredient ${rxItem.ingredientId} is not part of this purchase order`);
      }

      // Update quantityReceived in purchaseOrderItems
      const newReceived = itemDoc.quantityReceived + rxItem.quantityReceived;
      await ctx.db.patch(itemDoc._id, {
        quantityReceived: newReceived,
      });

      // Call mutateStock engine to increment stock and log movement
      const { internal } = require("./_generated/api");
      await ctx.runMutation(internal.inventory.mutateStock, {
        itemId: rxItem.ingredientId,
        quantity: rxItem.quantityReceived,
        movementType: "purchase_in",
        referenceType: "purchase_order",
        referenceId: po.orderCode,
        notes: `Received via PO ${po.orderCode}`,
        userId: actor._id,
        username: actor.username,
      });
    }

    // 3. Re-evaluate PO status
    const updatedItems = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", po._id))
      .collect();

    let allCompleted = true;
    let anyReceived = false;

    for (const item of updatedItems) {
      if (item.quantityReceived < item.quantityOrdered) {
        allCompleted = false;
      }
      if (item.quantityReceived > 0) {
        anyReceived = true;
      }
    }

    let newStatus: "draft" | "sent" | "partially_received" | "completed" | "cancelled" = po.status;
    if (allCompleted) {
      newStatus = "completed";
    } else if (anyReceived) {
      newStatus = "partially_received";
    }

    await ctx.db.patch(po._id, {
      status: newStatus,
    });

    return po._id;
  },
});

// Update PO payment status
export const updatePaymentStatus = mutation({
  args: {
    token: v.string(),
    id: v.id("purchaseOrders"),
    paymentStatus: v.union(v.literal("unpaid"), v.literal("partially_paid"), v.literal("paid")),
  },
  handler: async (ctx, args) => {
    await validateToken(ctx, args.token);

    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found");

    await ctx.db.patch(args.id, {
      paymentStatus: args.paymentStatus,
    });

    return args.id;
  },
});
