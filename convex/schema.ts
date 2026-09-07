import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * CLOTHING RETAIL MANAGEMENT SYSTEM — schema
 *
 * Core model: Category → Brand → Product → ProductVariant (the stockable SKU).
 * Stock is ledger-based: `inventoryMovements` is the source of truth, `variantStock`
 * is a per-branch denormalized cache updated in the same mutation as the ledger row.
 *
 * The `LEGACY` section at the bottom holds the old restaurant tables verbatim so
 * existing rows keep validating while `convex/migrations/*` transforms them. Those
 * tables (and the transition-only optional fields marked "// migration bridge")
 * are removed in a follow-up schema pass once `migrations.dropLegacy` has run.
 */

// ─────────────────────────────────────────────
// SHARED VALIDATORS
// ─────────────────────────────────────────────

export const INVENTORY_MOVEMENT_TYPES = [
  "INITIAL_STOCK",
  "PURCHASE",
  "PURCHASE_RETURN",
  "SALE",
  "SALE_RETURN",
  "STOCK_ADJUSTMENT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "DAMAGE",
  "LOSS",
  "FOUND",
] as const;

export default defineSchema({
  // ─────────────────────────────────────────────
  // CATALOG
  // ─────────────────────────────────────────────

  categories: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    active: v.boolean(),
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .searchIndex("search_name", { searchField: "name" }),

  brands: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .searchIndex("search_name", { searchField: "name" }),

  products: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    categoryId: v.id("categories"),
    brandId: v.optional(v.id("brands")),
    defaultCostPrice: v.number(),
    defaultSellingPrice: v.number(),
    primaryImageId: v.optional(v.id("_storage")),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_category", ["categoryId"])
    .index("by_brand", ["brandId"])
    .index("by_active", ["active"])
    .searchIndex("search_name", { searchField: "name" }),

  productVariants: defineTable({
    productId: v.id("products"),
    sku: v.string(),
    barcode: v.optional(v.string()),
    size: v.optional(v.string()),
    color: v.optional(v.string()),
    costPrice: v.number(),
    sellingPrice: v.number(),
    reorderLevel: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_sku", ["sku"])
    .index("by_barcode", ["barcode"])
    .index("by_active", ["active"]),

  productImages: defineTable({
    productId: v.id("products"),
    storageId: v.id("_storage"),
    sortOrder: v.number(),
    createdAt: v.number(),
  }).index("by_product", ["productId"]),

  // Per-branch stock cache. Ledger (`inventoryMovements`) is the source of truth;
  // this row is patched in the same mutation for O(1) reads.
  variantStock: defineTable({
    branchId: v.id("branches"),
    productVariantId: v.id("productVariants"),
    quantity: v.number(),
    reorderLevel: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_branch_and_variant", ["branchId", "productVariantId"])
    .index("by_variant", ["productVariantId"])
    .index("by_branch", ["branchId"]),

  // ─────────────────────────────────────────────
  // SALES
  // ─────────────────────────────────────────────

  sales: defineTable({
    saleNumber: v.string(),
    branchId: v.id("branches"),
    customerId: v.id("customers"),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    status: v.union(
      v.literal("COMPLETED"),
      v.literal("PARTIALLY_PAID"),
      v.literal("PENDING"),
      v.literal("CANCELLED"),
      v.literal("REFUNDED"),
      v.literal("PARTIALLY_REFUNDED")
    ),
    subtotal: v.number(),
    discount: v.number(),
    tax: v.number(),
    total: v.number(),
    paidAmount: v.number(),
    balance: v.number(),
    paymentStatus: v.union(
      v.literal("PAID"),
      v.literal("PARTIALLY_PAID"),
      v.literal("UNPAID"),
      v.literal("REFUNDED"),
      v.literal("PARTIALLY_REFUNDED")
    ),
    cashRegisterSessionId: v.optional(v.id("cashRegisterSessions")),
    isDelivery: v.optional(v.boolean()),
    deliveryFeeId: v.optional(v.id("deliveryFees")),
    deliveryFeeAmount: v.optional(v.number()),
    customerName: v.optional(v.string()),
    itemSummary: v.optional(
      v.array(
        v.object({
          productVariantId: v.optional(v.id("productVariants")),
          label: v.string(),
          quantity: v.number(),
        })
      )
    ),
    splitPayments: v.optional(
      v.array(v.object({ method: v.string(), amount: v.number() }))
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_customer", ["customerId"])
    .index("by_branch", ["branchId"])
    .index("by_created_at", ["createdAt"])
    .index("by_sale_number", ["saleNumber"]),

  saleItems: defineTable({
    saleId: v.id("sales"),
    productVariantId: v.id("productVariants"),
    productName: v.string(),
    variantLabel: v.string(), // e.g. "Black / M"
    sku: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    discount: v.number(),
    total: v.number(),
    costPriceAtSale: v.number(),
  })
    .index("by_sale", ["saleId"])
    .index("by_variant", ["productVariantId"]),

  salesReturns: defineTable({
    returnNumber: v.string(),
    saleId: v.id("sales"),
    branchId: v.id("branches"),
    customerId: v.id("customers"),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    status: v.union(v.literal("COMPLETED"), v.literal("CANCELLED")),
    refundMethod: v.union(
      v.literal("CASH"),
      v.literal("CARD"),
      v.literal("MPESA"),
      v.literal("EMOLA"),
      v.literal("BANK_TRANSFER"),
      v.literal("STORE_CREDIT"),
      v.literal("OTHER")
    ),
    refundAmount: v.number(),
    reason: v.string(),
    notes: v.optional(v.string()),
    cashRegisterSessionId: v.optional(v.id("cashRegisterSessions")),
    // For exchanges: the follow-up sale that issued replacement items.
    exchangeSaleId: v.optional(v.id("sales")),
    createdAt: v.number(),
  })
    .index("by_sale", ["saleId"])
    .index("by_branch", ["branchId"])
    .index("by_created_at", ["createdAt"])
    .index("by_return_number", ["returnNumber"]),

  salesReturnItems: defineTable({
    returnId: v.id("salesReturns"),
    saleItemId: v.id("saleItems"),
    productVariantId: v.id("productVariants"),
    quantity: v.number(),
    unitPrice: v.number(),
    refundAmount: v.number(),
    reason: v.union(
      v.literal("WRONG_SIZE"),
      v.literal("WRONG_COLOR"),
      v.literal("DEFECTIVE"),
      v.literal("CUSTOMER_CHANGED_MIND"),
      v.literal("WRONG_ITEM"),
      v.literal("OTHER")
    ),
    restock: v.boolean(),
  })
    .index("by_return", ["returnId"])
    .index("by_sale_item", ["saleItemId"]),

  payments: defineTable({
    saleId: v.optional(v.id("sales")),
    orderId: v.optional(v.id("orders")), // migration bridge (legacy rows)
    method: v.string(),
    amount: v.number(),
    // Negative amount = refund. `kind` disambiguates for reporting.
    kind: v.optional(v.union(v.literal("payment"), v.literal("refund"))),
    returnId: v.optional(v.id("salesReturns")),
    createdAt: v.number(),
  })
    .index("by_sale", ["saleId"])
    .index("by_order", ["orderId"]),

  // ─────────────────────────────────────────────
  // INVENTORY
  // ─────────────────────────────────────────────

  inventoryMovements: defineTable({
    movementDate: v.number(),
    productVariantId: v.optional(v.id("productVariants")),
    itemId: v.optional(v.id("ingredients")), // migration bridge (legacy rows)
    productName: v.optional(v.string()),
    variantLabel: v.optional(v.string()),
    itemName: v.optional(v.string()), // migration bridge (legacy rows)
    sku: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    movementType: v.string(), // see INVENTORY_MOVEMENT_TYPES
    quantity: v.number(), // negative for outflows
    unit: v.optional(v.string()),
    previousBalance: v.number(),
    newBalance: v.number(),
    costPerUnit: v.optional(v.number()),
    totalCostImpact: v.optional(v.number()),
    referenceType: v.optional(v.string()), // sale, sale_return, purchase_order, transfer, adjustment
    referenceId: v.optional(v.string()),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_variant", ["productVariantId"])
    .index("by_item", ["itemId"])
    .index("by_branch_and_variant", ["branchId", "productVariantId"])
    .index("by_date", ["movementDate"])
    .index("by_type", ["movementType"])
    .index("by_ref", ["referenceType", "referenceId"])
    .index("by_branch", ["branchId"]),

  stockAdjustments: defineTable({
    branchId: v.id("branches"),
    productVariantId: v.id("productVariants"),
    userId: v.id("users"),
    username: v.string(),
    reason: v.union(
      v.literal("PHYSICAL_COUNT"),
      v.literal("DAMAGED"),
      v.literal("MISSING"),
      v.literal("FOUND"),
      v.literal("INITIAL_STOCK"),
      v.literal("CORRECTION")
    ),
    previousQuantity: v.number(),
    adjustmentQuantity: v.number(), // signed delta
    newQuantity: v.number(),
    notes: v.string(),
    movementId: v.optional(v.id("inventoryMovements")),
    createdAt: v.number(),
  })
    .index("by_branch", ["branchId"])
    .index("by_variant", ["productVariantId"])
    .index("by_created_at", ["createdAt"]),

  stockTransfers: defineTable({
    transferNumber: v.string(),
    sourceBranchId: v.id("branches"),
    destinationBranchId: v.id("branches"),
    status: v.union(
      v.literal("DRAFT"),
      v.literal("PENDING"),
      v.literal("IN_TRANSIT"),
      v.literal("RECEIVED"),
      v.literal("CANCELLED")
    ),
    createdBy: v.id("users"),
    createdByUsername: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_source", ["sourceBranchId"])
    .index("by_destination", ["destinationBranchId"]),

  stockTransferItems: defineTable({
    transferId: v.id("stockTransfers"),
    productVariantId: v.id("productVariants"),
    quantity: v.number(),
  }).index("by_transfer", ["transferId"]),

  // ─────────────────────────────────────────────
  // CUSTOMERS / CRM
  // ─────────────────────────────────────────────

  customers: defineTable({
    name: v.string(),
    phone1: v.string(),
    phone2: v.optional(v.string()),
    phone3: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    notes: v.optional(v.string()),
    customerCode: v.optional(v.string()),
    isGeneric: v.optional(v.boolean()),
    active: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
  })
    .index("by_phone1", ["phone1"])
    .index("by_isGeneric", ["isGeneric"])
    .index("by_customer_code", ["customerCode"])
    .searchIndex("search_name", { searchField: "name" }),

  // Store-credit ledger. Balance is derived (sum of deltas / last balanceAfter),
  // never a directly editable field.
  customerCredits: defineTable({
    customerId: v.id("customers"),
    delta: v.number(), // signed
    balanceAfter: v.number(),
    reason: v.union(
      v.literal("RETURN_REFUND"),
      v.literal("OVERPAYMENT"),
      v.literal("MANUAL_GRANT"),
      v.literal("REDEEMED_ON_SALE")
    ),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_customer", ["customerId"])
    .index("by_created_at", ["createdAt"]),

  // ─────────────────────────────────────────────
  // PURCHASING
  // ─────────────────────────────────────────────

  suppliers: defineTable({
    name: v.string(),
    contactName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    taxNumber: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    paymentTerms: v.optional(v.string()),
    notes: v.optional(v.string()),
    suppliedIngredients: v.optional(v.array(v.id("ingredients"))), // migration bridge
    suppliedVariants: v.optional(v.array(v.id("productVariants"))),
    createdAt: v.number(),
  }).index("by_status", ["status"]),

  purchaseOrders: defineTable({
    supplierId: v.id("suppliers"),
    branchId: v.optional(v.id("branches")),
    orderCode: v.string(),
    orderDate: v.number(),
    expectedDeliveryDate: v.optional(v.number()),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("partially_received"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
    paymentStatus: v.union(
      v.literal("unpaid"),
      v.literal("partially_paid"),
      v.literal("paid")
    ),
    totalAmount: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_supplier", ["supplierId"])
    .index("by_status", ["status"])
    .index("by_branch", ["branchId"]),

  purchaseOrderItems: defineTable({
    purchaseOrderId: v.id("purchaseOrders"),
    productVariantId: v.optional(v.id("productVariants")),
    ingredientId: v.optional(v.id("ingredients")), // migration bridge (legacy rows)
    quantityOrdered: v.number(),
    quantityReceived: v.number(),
    unitCost: v.number(),
    totalCost: v.number(),
  }).index("by_purchase_order", ["purchaseOrderId"]),

  // ─────────────────────────────────────────────
  // CASH REGISTER
  // ─────────────────────────────────────────────

  cashRegisterSessions: defineTable({
    userId: v.id("users"),
    username: v.string(),
    openingAmount: v.number(),
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
    status: v.union(v.literal("open"), v.literal("closed")),
    notes: v.optional(v.string()),
    closingNotes: v.optional(v.string()),
    actualCash: v.optional(v.number()),
    difference: v.optional(v.number()),
    cashSalesTotal: v.optional(v.number()),
    cashInTotal: v.optional(v.number()),
    cashOutTotal: v.optional(v.number()),
    cashRefundTotal: v.optional(v.number()),
    expectedCash: v.optional(v.number()),
    salesByUser: v.optional(
      v.array(v.object({ username: v.string(), amount: v.number() }))
    ),
    branchId: v.optional(v.id("branches")),
  })
    .index("by_user", ["userId"])
    .index("by_status", ["status"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_branch", ["branchId"]),

  cashRegisterMovements: defineTable({
    sessionId: v.id("cashRegisterSessions"),
    userId: v.id("users"),
    username: v.string(),
    type: v.union(
      v.literal("opening"),
      v.literal("sale"),
      v.literal("refund"),
      v.literal("cash_in"),
      v.literal("cash_out"),
      v.literal("closing")
    ),
    amount: v.number(),
    description: v.string(),
    orderId: v.optional(v.id("orders")), // migration bridge (legacy rows)
    saleId: v.optional(v.id("sales")),
    returnId: v.optional(v.id("salesReturns")),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"])
    .index("by_order", ["orderId"])
    .index("by_sale", ["saleId"]),

  // ─────────────────────────────────────────────
  // USERS & SECURITY
  // ─────────────────────────────────────────────

  users: defineTable({
    name: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("manager"),
      v.literal("pos_seller")
    ),
    status: v.union(v.literal("active"), v.literal("disabled")),
    lastLogin: v.optional(v.number()),
    createdAt: v.number(),
    branchId: v.optional(v.id("branches")),
  })
    .index("by_username", ["username"])
    .index("by_role", ["role"])
    .index("by_status", ["status"])
    .index("by_branch", ["branchId"]),

  userSessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    userAgent: v.optional(v.string()),
    device: v.optional(v.string()),
    browser: v.optional(v.string()),
    lastActivity: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"])
    .index("by_expires_at", ["expiresAt"]),

  auditLogs: defineTable({
    userId: v.id("users"),
    username: v.string(),
    action: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    details: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_action", ["action"])
    .index("by_created_at", ["createdAt"]),

  // ─────────────────────────────────────────────
  // SYSTEM / ANALYTICS
  // ─────────────────────────────────────────────

  branches: defineTable({
    name: v.string(),
    code: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    isDefault: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_code", ["code"]),

  deliveryFees: defineTable({
    name: v.string(),
    fee: v.number(),
    description: v.optional(v.string()),
    active: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  // Key/value business configuration. `value` holds a JSON-ish scalar/string.
  settings: defineTable({
    key: v.string(),
    isActive: v.boolean(),
    value: v.optional(v.string()),
    label: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // O(1) sequences (sale_sequence_<branchId>, purchase_order_sequence,
  // return_sequence, transfer_sequence, customer_code_sequence) and aggregate
  // caches (today_* live counters, low_stock_items, out_of_stock_items).
  counters: defineTable({
    key: v.string(),
    value: v.number(),
    dateString: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // Pre-aggregated analytics. Optimization layer only — transactional tables are
  // the source of truth. Fields are permissive during the analytics reshape.
  dailyMetrics: defineTable({
    dateString: v.string(),
    branchId: v.optional(v.id("branches")),

    totalRevenue: v.optional(v.number()),
    totalSales: v.optional(v.number()),
    totalItemsSold: v.optional(v.number()),
    totalDiscount: v.optional(v.number()),
    totalTax: v.optional(v.number()),
    totalReturns: v.optional(v.number()),
    refundAmount: v.optional(v.number()),
    totalProfit: v.optional(v.number()),
    totalPending: v.optional(v.number()),
    cashCollected: v.optional(v.number()),
    outstandingDebt: v.optional(v.number()),

    paymentMethods: v.optional(
      v.record(v.string(), v.object({ amount: v.number(), count: v.number() }))
    ),
    categorySales: v.optional(v.record(v.string(), v.number())),
    brandSales: v.optional(v.record(v.string(), v.number())),
    productSales: v.optional(v.record(v.string(), v.number())),
    sizeSales: v.optional(v.record(v.string(), v.number())),
    colorSales: v.optional(v.record(v.string(), v.number())),
    customerIds: v.optional(v.array(v.string())),

    // legacy restaurant fields (migration bridge — dropped after rebuildAnalytics)
    grossRevenue: v.optional(v.number()),
    deliveryRevenue: v.optional(v.number()),
    orderCount: v.optional(v.number()),
    cancelledOrderCount: v.optional(v.number()),
    deliveryOrdersCount: v.optional(v.number()),
    pickupOrdersCount: v.optional(v.number()),
    profileSalesCount: v.optional(v.number()),
    genericSalesCount: v.optional(v.number()),
    fullyPaidCount: v.optional(v.number()),
    partiallyPaidCount: v.optional(v.number()),
    pendingCount: v.optional(v.number()),
    wasteCount: v.optional(v.number()),
    wasteCost: v.optional(v.number()),
  }).index("by_date", ["dateString"])
    .index("by_date_and_branch", ["dateString", "branchId"]),

  // Temporary lookup used by `convex/migrations/*` to resolve legacy ids to new
  // catalog ids across batched, self-rescheduling steps. Dropped by dropLegacy.
  migrationMap: defineTable({
    kind: v.string(), // "dish" | "ingredient" | "order" | "orderItem" | "payment"
    legacyId: v.string(),
    newId: v.string(),
  })
    .index("by_kind_and_legacy", ["kind", "legacyId"]),

  // ═════════════════════════════════════════════
  // LEGACY — restaurant tables, kept verbatim for migration.
  // Removed in a follow-up schema pass after migrations.dropLegacy.
  // ═════════════════════════════════════════════

  dishes: defineTable({
    name: v.string(),
    price: v.number(),
    category: v.string(),
    isActive: v.optional(v.boolean()),
    description: v.optional(v.string()),
    options: v.optional(v.any()),
    isCombo: v.optional(v.boolean()),
    selectableInCombo: v.optional(v.boolean()),
    comboRole: v.optional(v.string()),
    comboConfig: v.optional(
      v.object({
        allowedMains: v.optional(v.array(v.id("dishes"))),
        allowedSides: v.optional(v.array(v.id("dishes"))),
        allowedDrinks: v.optional(v.array(v.id("dishes"))),
        mainsLimit: v.optional(v.number()),
        sidesLimit: v.number(),
        drinksLimit: v.number(),
      })
    ),
    standalonePackaging: v.optional(
      v.array(v.object({ ingredientId: v.id("ingredients"), quantity: v.number() }))
    ),
    comboPackaging: v.optional(
      v.array(v.object({ ingredientId: v.id("ingredients"), quantity: v.number() }))
    ),
  }).index("by_category", ["category"]),

  ingredients: defineTable({
    name: v.string(),
    category: v.string(),
    stockQuantity: v.number(),
    unit: v.string(),
    lowStockThreshold: v.number(),
  }),

  dishIngredients: defineTable({
    dishId: v.id("dishes"),
    ingredientId: v.id("ingredients"),
    quantity: v.number(),
  })
    .index("by_dish", ["dishId"])
    .index("by_ingredient", ["ingredientId"]),

  orders: defineTable({
    total: v.number(),
    status: v.string(),
    paymentMethod: v.optional(v.string()),
    amountPaid: v.number(),
    customerId: v.id("customers"),
    createdAt: v.number(),
    orderCode: v.optional(v.string()),
    prepStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("preparing"),
        v.literal("ready"),
        v.literal("completed")
      )
    ),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    cashRegisterSessionId: v.optional(v.id("cashRegisterSessions")),
    orderType: v.optional(v.string()),
    deliveryFeeId: v.optional(v.id("deliveryFees")),
    deliveryFeeName: v.optional(v.string()),
    deliveryFeeAmount: v.optional(v.number()),
    splitPayments: v.optional(
      v.array(v.object({ method: v.string(), amount: v.number() }))
    ),
    customerName: v.optional(v.string()),
    itemSummary: v.optional(
      v.array(
        v.object({
          dishId: v.optional(v.id("dishes")),
          dishName: v.string(),
          quantity: v.number(),
        })
      )
    ),
    branchId: v.optional(v.id("branches")),
  })
    .index("by_status", ["status"])
    .index("by_customer", ["customerId"])
    .index("by_delivery_fee", ["deliveryFeeId"])
    .index("by_created_at", ["createdAt"])
    .index("by_branch", ["branchId"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
    dishId: v.id("dishes"),
    quantity: v.number(),
    priceAtTime: v.number(),
    modifiers: v.optional(
      v.array(v.object({ name: v.string(), price: v.number() }))
    ),
    comboSelections: v.optional(
      v.array(
        v.object({
          category: v.string(),
          dishId: v.optional(v.id("dishes")),
          name: v.string(),
          extraCharge: v.number(),
        })
      )
    ),
  }).index("by_order", ["orderId"]),

  factoryRecipes: defineTable({
    producedIngredientId: v.id("ingredients"),
    outputQuantity: v.number(),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    ingredients: v.array(
      v.object({ ingredientId: v.id("ingredients"), quantity: v.number() })
    ),
  }).index("by_produced_ingredient", ["producedIngredientId"]),

  productionLogs: defineTable({
    recipeId: v.id("factoryRecipes"),
    producedIngredientId: v.id("ingredients"),
    quantityProduced: v.number(),
    producedAt: v.number(),
    notes: v.optional(v.string()),
    ingredientsConsumed: v.optional(
      v.array(
        v.object({ ingredientId: v.id("ingredients"), quantity: v.number() })
      )
    ),
  }).index("by_produced_ingredient", ["producedIngredientId"]),

  wasteLogs: defineTable({
    itemId: v.id("ingredients"),
    itemName: v.string(),
    quantity: v.number(),
    unit: v.string(),
    wasteType: v.string(),
    reason: v.string(),
    costImpact: v.optional(v.number()),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    createdAt: v.number(),
    branchId: v.optional(v.id("branches")),
  })
    .index("by_item", ["itemId"])
    .index("by_created", ["createdAt"])
    .index("by_branch", ["branchId"]),
});
