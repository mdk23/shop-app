import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { refundMethodValidator } from "./lib/paymentMethods";
import { governanceTables } from "./schemaTables/governance";
import { catalogTables } from "./schemaTables/catalog";
import { relationTables } from "./schemaTables/relations";
import { commitmentTables } from "./schemaTables/commitments";
import { procurementTables } from "./schemaTables/procurement";
import { stockTables } from "./schemaTables/stock";
import { afterSalesTables } from "./schemaTables/afterSales";
import { planningTables } from "./schemaTables/planning";
import { supplyChainTables } from "./schemaTables/supplyChain";

/**
 * CLOTHING RETAIL MANAGEMENT SYSTEM — schema
 *
 * Core model: Category → Product → ProductVariant (the stockable SKU), with
 * variants drawing their size/colour from the configurable `sizes`/`colors` lists.
 * Stock is ledger-based: `inventoryMovements` is the source of truth, `variantStock`
 * is a per-branch denormalized cache updated in the same mutation as the ledger row.
 *
 * The restaurant-era tables and migration-only fields were removed once the
 * legacy data had been migrated (see git history before this pass).
 */

// ─────────────────────────────────────────────
// SHARED VALIDATORS
// ─────────────────────────────────────────────

export const INVENTORY_MOVEMENT_TYPES = [
  "INITIAL_STOCK",
  "PURCHASE",
  "PURCHASE_RETURN",
  "SALE",
  "SALE_CANCELLATION",
  "SALE_RETURN",
  "STOCK_ADJUSTMENT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "DAMAGE",
  "LOSS",
  "FOUND",
] as const;

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const movementTypeValidator = v.union(
  ...INVENTORY_MOVEMENT_TYPES.map((type) => v.literal(type))
);

/** Why stock was corrected by hand or by a stock count. Kept on the movement itself. */
export const ADJUSTMENT_REASONS = [
  "PHYSICAL_COUNT",
  "DAMAGED",
  "MISSING",
  "FOUND",
  "INITIAL_STOCK",
  "CORRECTION",
] as const;

export const adjustmentReasonValidator = v.union(
  ...ADJUSTMENT_REASONS.map((reason) => v.literal(reason))
);

export default defineSchema({
  // ─────────────────────────────────────────────
  // CATALOG
  // ─────────────────────────────────────────────

  categories: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    parentId: v.optional(v.id("categories")),
    active: v.boolean(),
    sortOrder: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_parent", ["parentId"])
    .searchIndex("search_name", { searchField: "name" }),

  products: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    categoryId: v.id("categories"),
    collectionId: v.optional(v.id("collections")),
    taxRateId: v.optional(v.id("taxRates")),
    gender: v.optional(v.union(v.literal("women"), v.literal("men"), v.literal("unisex"))),
    defaultCostPrice: v.number(),
    defaultSellingPrice: v.number(),
    primaryImageId: v.optional(v.id("_storage")),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_category", ["categoryId"])
    .index("by_collection", ["collectionId"])
    .index("by_active", ["active"])
    .searchIndex("search_name", { searchField: "name" }),

  // Season / drop grouping for products (e.g. "Verão 2026").
  collections: defineTable({
    name: v.string(),
    season: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active", ["active"]),

  // Size scales let the same label mean different things per brand/region
  // (e.g. "M" clothing vs. EU/UK/US shoe sizes). Sizes belong to one scale.
  sizeScales: defineTable({
    name: v.string(),
    scaleType: v.union(v.literal("CLOTHING"), v.literal("SHOE"), v.literal("GENERAL")),
    region: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active", ["active"]),

  // Configurable size taxonomy (e.g. XS, S, M, L, XL) used when creating variants —
  // keeps size labels consistent across products instead of free text.
  sizes: defineTable({
    name: v.string(),
    scaleId: v.optional(v.id("sizeScales")),
    sortOrder: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_active", ["active"])
    .index("by_scale", ["scaleId"]),

  // Configurable colour taxonomy used when creating variants.
  colors: defineTable({
    name: v.string(),
    hex: v.optional(v.string()), // swatch, e.g. "#1A2517"
    family: v.optional(v.string()), // e.g. "Neutros", "Azuis"
    sortOrder: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active", ["active"]),

  // A variant's size and colour are `sizeId` / `colorId` only; names are read from the
  // `sizes` / `colors` lists (see convex/lib/variantNames.ts).
  productVariants: defineTable({
    productId: v.id("products"),
    sku: v.string(),
    barcode: v.optional(v.string()),
    sizeId: v.optional(v.id("sizes")),
    colorId: v.optional(v.id("colors")),
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

  // Price lists. The default list mirrors `productVariants.sellingPrice`; further
  // lists (wholesale, staff) can be added without schema changes.
  priceLists: defineTable({
    name: v.string(),
    isDefault: v.boolean(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_default", ["isDefault"]),

  // Price history by validity. Never updated in place: a change closes the open row
  // (validTo) and inserts a new one. The open row is the one with validTo undefined.
  variantPrices: defineTable({
    productVariantId: v.id("productVariants"),
    priceListId: v.id("priceLists"),
    price: v.number(),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_variant_list_from", ["productVariantId", "priceListId", "validFrom"])
    .index("by_list", ["priceListId"]),

  // Promotions. Targets live in `promotionTargets`, one catalogue level per row.
  promotions: defineTable({
    name: v.string(),
    kind: v.union(
      v.literal("PERCENT_OFF"),
      v.literal("AMOUNT_OFF"),
      v.literal("FIXED_PRICE")
    ),
    value: v.number(),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
    active: v.boolean(),
    createdBy: v.id("users"),
    createdByUsername: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active", ["active"]),

  promotionTargets: defineTable({
    promotionId: v.id("promotions"),
    productVariantId: v.optional(v.id("productVariants")),
    productId: v.optional(v.id("products")),
    categoryId: v.optional(v.id("categories")),
    collectionId: v.optional(v.id("collections")),
  })
    .index("by_promotion", ["promotionId"])
    .index("by_variant", ["productVariantId"])
    .index("by_product", ["productId"])
    .index("by_category", ["categoryId"])
    .index("by_collection", ["collectionId"]),

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
  // FISCAL (Mozambique)
  // ─────────────────────────────────────────────

  // IVA rates. A product points at one rate; `exemptionCode` documents why a 0%
  // rate applies (e.g. a legal exemption) and is shown on the fiscal document.
  taxRates: defineTable({
    name: v.string(),
    percentage: v.number(),
    exemptionCode: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_active", ["active"]),

  // The one source of document numbers: a gapless series per document type and year
  // (see convex/lib/numbering.ts). `lastNumber` is bumped in the same mutation that
  // creates the document, so a rolled-back document consumes no number and a cancelled
  // one keeps its number.
  documentSeries: defineTable({
    documentType: v.union(
      v.literal("SALE"),
      v.literal("RETURN"),
      v.literal("PURCHASE_ORDER"),
      v.literal("PURCHASE_RECEIPT"),
      v.literal("TRANSFER"),
      v.literal("CUSTOMER_ORDER")
    ),
    prefix: v.string(),
    fiscalYear: v.number(),
    lastNumber: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_type_year", ["documentType", "fiscalYear"]),

  // ─────────────────────────────────────────────
  // SALES
  // ─────────────────────────────────────────────

  sales: defineTable({
    saleNumber: v.string(), // the gapless fiscal number, e.g. "FT 2026/000042"
    branchId: v.id("branches"),
    customerId: v.id("customers"),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    // What happened to the sale (goods). Money owed or refunded is `paymentStatus`.
    status: v.union(
      v.literal("COMPLETED"),
      v.literal("CANCELLED"),
      v.literal("RETURNED"),
      v.literal("PARTIALLY_RETURNED")
    ),
    subtotal: v.number(),
    discount: v.number(),
    tax: v.number(),
    total: v.number(),
    paidAmount: v.number(),
    balance: v.number(),
    // The money: paid, owed (UNPAID / PARTIALLY_PAID) or given back.
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
    // Automatic tier discount applied by performSale — separate from the
    // cashier-entered `discount` above, for auditability.
    tierDiscountAmount: v.optional(v.number()),
    customerNuit: v.optional(v.string()),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_payment_status", ["paymentStatus"])
    .index("by_customer", ["customerId"])
    .index("by_branch", ["branchId"])
    .index("by_created_at", ["createdAt"])
    .index("by_sale_number", ["saleNumber"])
    .index("by_delivery_fee", ["deliveryFeeId"]),

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
    // Per-line IVA, snapshotted at sale time so later rate changes never rewrite history.
    taxRateId: v.optional(v.id("taxRates")),
    taxRatePercent: v.optional(v.number()),
    taxAmount: v.optional(v.number()),
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
    // The goods' value is the sum of the return's lines; the money given back is its
    // refund rows in `payments` (by_return).
    reason: v.string(),
    notes: v.optional(v.string()),
    // For exchanges: the follow-up sale that issued replacement items.
    exchangeSaleId: v.optional(v.id("sales")),
    resolutionId: v.optional(v.id("resolutions")),
    complaintId: v.optional(v.id("complaints")),
    createdAt: v.number(),
  })
    .index("by_sale", ["saleId"])
    .index("by_branch", ["branchId"])
    .index("by_created_at", ["createdAt"])
    .index("by_return_number", ["returnNumber"])
    .index("by_customer", ["customerId"]),

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
    // DAMAGED goods are never put back on sale, whatever `restock` says.
    condition: v.optional(
      v.union(v.literal("SELLABLE"), v.literal("USED"), v.literal("DAMAGED"))
    ),
  })
    .index("by_return", ["returnId"])
    .index("by_sale_item", ["saleItemId"]),

  // Every amount received or given back: on a sale, or a deposit on a customer order
  // (`customerOrderId`; linked to the sale too once the order is collected). Cash rows
  // carry the register session they went through: they are the drawer's record.
  payments: defineTable({
    saleId: v.optional(v.id("sales")),
    customerOrderId: v.optional(v.id("customerOrders")),
    method: refundMethodValidator, // STORE_CREDIT only on refunds

    amount: v.number(),
    // Negative amount = refund. `kind` disambiguates for reporting.
    kind: v.optional(v.union(v.literal("payment"), v.literal("refund"))),
    returnId: v.optional(v.id("salesReturns")),
    cashRegisterSessionId: v.optional(v.id("cashRegisterSessions")),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    reference: v.optional(v.string()), // external reference, e.g. an M-Pesa code
    createdAt: v.number(),
  })
    .index("by_sale", ["saleId"])
    .index("by_customer_order", ["customerOrderId"])
    .index("by_return", ["returnId"])
    .index("by_session", ["cashRegisterSessionId"]),

  // ─────────────────────────────────────────────
  // INVENTORY
  // ─────────────────────────────────────────────

  inventoryMovements: defineTable({
    movementDate: v.number(),
    productVariantId: v.optional(v.id("productVariants")),
    productName: v.optional(v.string()),
    variantLabel: v.optional(v.string()),
    sku: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    movementType: movementTypeValidator,
    quantity: v.number(), // negative for outflows
    unit: v.optional(v.string()),
    previousBalance: v.number(),
    newBalance: v.number(),
    costPerUnit: v.optional(v.number()),
    totalCostImpact: v.optional(v.number()),
    referenceType: v.optional(v.string()), // sale, sale_return, purchase_order, transfer, stock_adjustment
    referenceId: v.optional(v.string()),
    // Set on stock adjustments (referenceType "stock_adjustment"): manual corrections
    // and stock-count corrections. The movement is the adjustment's only record.
    adjustmentReason: v.optional(adjustmentReasonValidator),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_variant", ["productVariantId"])
    .index("by_branch_and_variant", ["branchId", "productVariantId"])
    .index("by_date", ["movementDate"])
    .index("by_type", ["movementType"])
    .index("by_ref", ["referenceType", "referenceId"])
    .index("by_reference_type_and_date", ["referenceType", "movementDate"])
    .index("by_branch", ["branchId"]),

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
    createdByUsername: v.string(),
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

  // What the destination actually counted when a transfer arrived. Lines live in
  // `stockTransferReceiptLines`, like purchase receipt and stock count lines.
  stockTransferReceipts: defineTable({
    transferId: v.id("stockTransfers"),
    receivedBy: v.id("users"),
    receivedByUsername: v.string(),
    receivedAt: v.number(),
  }).index("by_transfer", ["transferId"]),

  // One line per variant: what was sent and what the destination counted, so a short
  // delivery is visible on the line.
  stockTransferReceiptLines: defineTable({
    receiptId: v.id("stockTransferReceipts"),
    productVariantId: v.id("productVariants"),
    quantitySent: v.number(),
    quantityObserved: v.number(),
  }).index("by_receipt", ["receiptId"]),

  // Physical count session for one branch. Lines snapshot the book quantity when the
  // count starts; closing applies the difference between the counted quantity and
  // the quantity on hand at close time, so sales made during the count are kept.
  stockCounts: defineTable({
    branchId: v.id("branches"),
    status: v.union(v.literal("OPEN"), v.literal("CLOSED")),
    notes: v.optional(v.string()),
    startedBy: v.id("users"),
    startedByUsername: v.string(),
    startedAt: v.number(),
    closedAt: v.optional(v.number()),
  })
    .index("by_branch", ["branchId"])
    .index("by_status", ["status"]),

  stockCountLines: defineTable({
    countId: v.id("stockCounts"),
    productVariantId: v.id("productVariants"),
    expectedQuantity: v.number(),
    countedQuantity: v.optional(v.number()),
    appliedDelta: v.optional(v.number()),
  })
    .index("by_count", ["countId"])
    .index("by_count_and_variant", ["countId", "productVariantId"]),

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
    status: v.optional(
      v.union(v.literal("ACTIVE"), v.literal("ARCHIVED"))
    ),
    // Customer-centric POS fields — all optional, no migration needed.
    photoUrl: v.optional(v.string()),
    tier: v.optional(
      v.union(v.literal("NOVO"), v.literal("REGULAR"), v.literal("VIP"))
    ),
    tierUpdatedAt: v.optional(v.number()),
    preferredGender: v.optional(
      v.union(v.literal("women"), v.literal("men"), v.literal("unisex"))
    ),
    preferredSports: v.optional(v.array(v.string())),
    preferredColorIds: v.optional(v.array(v.id("colors"))),
    preferredCategoryIds: v.optional(v.array(v.id("categories"))),
    // No brand taxonomy exists in the catalog (single-brand shop) — this is a
    // cashier-entered free-text preference only, not joined against products.
    preferredBrands: v.optional(v.array(v.string())),
    whatsappOptIn: v.optional(v.boolean()),
    // Tier 3 — derived-only, never form input. Cached here because computing
    // them requires the same bounded sale-history scan already done for size
    // inference/tier in refreshCustomerProfile; recomputed on every sale/
    // return/cancel alongside tier, never editable by a cashier.
    topCategoryName: v.optional(v.string()),
    topColorName: v.optional(v.string()),
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

  // Per-customer, per-category size memory. Populated by inference from sale
  // history (INFERIDO) or set by hand in the Ficha (CONFIRMADO, never
  // overwritten by inference). sizeName is denormalized so the POS rail can
  // render chips with zero joins.
  // Customer orders (encomendas): goods the customer pays for in parts (deposits)
  // and collects later. Prices are snapshotted on the lines at order time.
  customerOrders: defineTable({
    orderNumber: v.string(),
    customerId: v.id("customers"),
    branchId: v.id("branches"),
    status: v.union(
      v.literal("OPEN"),
      v.literal("READY"),
      v.literal("COLLECTED"),
      v.literal("CANCELLED")
    ),
    totalAmount: v.number(),
    expectedDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    paymentTermId: v.optional(v.id("paymentTerms")),
    conditions: v.optional(v.string()),
    saleId: v.optional(v.id("sales")),
    createdBy: v.id("users"),
    createdByUsername: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    closedAt: v.optional(v.number()),
  })
    .index("by_customer", ["customerId"])
    .index("by_status", ["status"])
    .index("by_order_number", ["orderNumber"]),

  customerOrderItems: defineTable({
    orderId: v.id("customerOrders"),
    productVariantId: v.id("productVariants"),
    productName: v.string(),
    variantLabel: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    lineTotal: v.number(),
  }).index("by_order", ["orderId"]),

  // Stock set aside for an order. Holds reduce what the POS can sell, and are
  // released when the order is collected or cancelled.
  stockHolds: defineTable({
    orderId: v.id("customerOrders"),
    branchId: v.id("branches"),
    productVariantId: v.id("productVariants"),
    quantity: v.number(),
    status: v.union(v.literal("ACTIVE"), v.literal("RELEASED")),
    createdAt: v.number(),
    releasedAt: v.optional(v.number()),
  })
    .index("by_order", ["orderId"])
    .index("by_branch_variant_status", ["branchId", "productVariantId", "status"]),

  // Complaints (reclamações) from a customer about a purchase. Resolved by a return,
  // a repair, a credit, or rejected; a return can point back to the complaint.
  complaints: defineTable({
    customerId: v.optional(v.id("customers")),
    saleId: v.optional(v.id("sales")),
    description: v.string(),
    status: v.union(v.literal("OPEN"), v.literal("RESOLVED"), v.literal("REJECTED")),
    resolutionId: v.optional(v.id("resolutions")),
    resolutionNotes: v.optional(v.string()),
    createdBy: v.id("users"),
    createdByUsername: v.string(),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_customer", ["customerId"])
    .index("by_sale", ["saleId"])
    .index("by_status", ["status"]),

  // Customer demand: something a customer wants, from first ask to the outcome.
  // OPEN → PROCEEDING → CONVERTED (became a customer order) or FULFILLED (met some
  // other way) or LOST. CONVERTED, FULFILLED and LOST are final.
  // Two views of one table: Procuras lists every demand; Oportunidades lists the
  // ones that proceeded (`proceededAt` set), so a lost opportunity stays on it.
  // `reason` says why the sale did not happen (set when recorded or when lost), so
  // lost sales can be counted by cause. `customerId` is optional for walk-ins.
  demands: defineTable({
    customerId: v.optional(v.id("customers")),
    description: v.string(),
    productId: v.optional(v.id("products")),
    productVariantId: v.optional(v.id("productVariants")),
    categoryId: v.optional(v.id("categories")),
    sizeId: v.optional(v.id("sizes")),
    colorId: v.optional(v.id("colors")),
    maxPrice: v.optional(v.number()), // customer's budget
    estimatedValue: v.optional(v.number()), // what the sale would be worth
    quantity: v.optional(v.number()),
    neededBy: v.optional(v.number()),
    intendedUse: v.optional(v.string()),
    conditions: v.optional(v.string()),
    notes: v.optional(v.string()),
    branchId: v.optional(v.id("branches")),
    stage: v.union(
      v.literal("OPEN"),
      v.literal("PROCEEDING"),
      v.literal("CONVERTED"),
      v.literal("FULFILLED"),
      v.literal("LOST")
    ),
    reason: v.optional(
      v.union(
        v.literal("SIZE"),
        v.literal("COLOR"),
        v.literal("PRICE"),
        v.literal("STOCK"),
        v.literal("OTHER")
      )
    ),
    convertedOrderId: v.optional(v.id("customerOrders")),
    proceededAt: v.optional(v.number()),
    createdBy: v.id("users"),
    createdByUsername: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    closedAt: v.optional(v.number()),
  })
    .index("by_customer", ["customerId"])
    .index("by_stage", ["stage"])
    .index("by_reason", ["reason"])
    .index("by_proceeded_at", ["proceededAt"]),

  // Contacts with a customer (calls, WhatsApp, visits). Follow-up notes that used to
  // live only in `customers.notes`.
  customerInteractions: defineTable({
    customerId: v.id("customers"),
    channel: v.union(
      v.literal("PHONE"),
      v.literal("WHATSAPP"),
      v.literal("IN_STORE"),
      v.literal("EMAIL"),
      v.literal("OTHER")
    ),
    summary: v.string(),
    occurredAt: v.number(),
    createdBy: v.id("users"),
    createdByUsername: v.string(),
    createdAt: v.number(),
  }).index("by_customer", ["customerId", "occurredAt"]),

  customerSizeProfiles: defineTable({
    customerId: v.id("customers"),
    categoryId: v.id("categories"),
    sizeId: v.id("sizes"),
    sizeName: v.string(),
    confidence: v.union(v.literal("CONFIRMADO"), v.literal("INFERIDO")),
    updatedAt: v.number(),
  })
    .index("by_customer", ["customerId"])
    .index("by_customer_category", ["customerId", "categoryId"]),

  // ─────────────────────────────────────────────
  // PURCHASING
  // ─────────────────────────────────────────────

  suppliers: defineTable({
    name: v.string(),
    contactName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    // The terms this supplier works on, from the shared `paymentTerms` list. Its tax
    // number (NUIT) is in `fiscalIdentities`.
    paymentTermId: v.optional(v.id("paymentTerms")),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_status", ["status"]),

  // An order is placed under a supply relation (the partnership and its terms in force);
  // `supplierId` is that relation's supplier, kept here for direct lookups.
  purchaseOrders: defineTable({
    supplyRelationId: v.id("supplyRelations"),
    supplierId: v.id("suppliers"),
    branchId: v.optional(v.id("branches")),
    orderCode: v.string(),
    orderDate: v.number(),
    expectedDeliveryDate: v.optional(v.number()),
    status: v.union(
      v.literal("DRAFT"),
      v.literal("SENT"),
      v.literal("PARTIALLY_RECEIVED"),
      v.literal("COMPLETED"),
      v.literal("CANCELLED")
    ),
    paymentStatus: v.union(v.literal("UNPAID"), v.literal("PARTIALLY_PAID"), v.literal("PAID")),
    totalAmount: v.number(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_supplier", ["supplierId"])
    .index("by_supply_relation", ["supplyRelationId"])
    .index("by_status", ["status"])
    .index("by_branch", ["branchId"]),

  purchaseOrderItems: defineTable({
    purchaseOrderId: v.id("purchaseOrders"),
    productVariantId: v.optional(v.id("productVariants")),
    quantityOrdered: v.number(),
    quantityReceived: v.number(),
    unitCost: v.number(),
    totalCost: v.number(),
  }).index("by_purchase_order", ["purchaseOrderId"]),

  // A goods-received note. Every stock increase from a purchase goes through one of
  // these, so receiving has a document of its own. `purchaseOrderId` is absent for
  // goods that arrived without an order.
  purchaseReceipts: defineTable({
    receiptNumber: v.string(),
    purchaseOrderId: v.optional(v.id("purchaseOrders")),
    supplierId: v.optional(v.id("suppliers")),
    branchId: v.id("branches"),
    deliveryNoteRef: v.optional(v.string()),
    notes: v.optional(v.string()),
    unitsTotal: v.number(),
    receivedBy: v.id("users"),
    receivedByUsername: v.string(),
    receivedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_purchase_order", ["purchaseOrderId"])
    .index("by_branch", ["branchId"])
    .index("by_receipt_number", ["receiptNumber"]),

  purchaseReceiptItems: defineTable({
    receiptId: v.id("purchaseReceipts"),
    productVariantId: v.id("productVariants"),
    quantityReceived: v.number(),
    unitCost: v.number(),
    purchaseOrderItemId: v.optional(v.id("purchaseOrderItems")),
    // OVER: more than the order still had outstanding (kept, flagged).
    // UNANNOUNCED: not on the order at all, or received without one.
    discrepancy: v.optional(v.union(v.literal("OVER"), v.literal("UNANNOUNCED"))),
  })
    .index("by_receipt", ["receiptId"])
    .index("by_variant", ["productVariantId"]),

  // ─────────────────────────────────────────────
  // CASH REGISTER
  // ─────────────────────────────────────────────

  cashRegisterSessions: defineTable({
    userId: v.id("users"),
    username: v.string(),
    openingAmount: v.number(),
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
    status: v.union(v.literal("OPEN"), v.literal("CLOSED")),
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

  // Drawer movements that are not sale payments: opening float, cash in/out, closing.
  // Cash taken or refunded on sales is read from `payments` (by session).
  cashRegisterMovements: defineTable({
    sessionId: v.id("cashRegisterSessions"),
    userId: v.id("users"),
    username: v.string(),
    type: v.union(
      v.literal("opening"),
      v.literal("cash_in"),
      v.literal("cash_out"),
      v.literal("closing")
    ),
    amount: v.number(),
    description: v.string(),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"]),

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
    status: v.union(v.literal("ACTIVE"), v.literal("DISABLED")),
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
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
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
    createdBy: v.id("users"),
    createdByUsername: v.string(),
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

  // Aggregate caches (today_* live counters, low_stock_items, out_of_stock_items) and
  // the customer code sequence. Document numbers come from `documentSeries`.
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
    productSales: v.optional(v.record(v.string(), v.number())),
    sizeSales: v.optional(v.record(v.string(), v.number())),
    colorSales: v.optional(v.record(v.string(), v.number())),

    fullyPaidCount: v.optional(v.number()),
    partiallyPaidCount: v.optional(v.number()),
    pendingCount: v.optional(v.number()),
  }).index("by_date", ["dateString"])
    .index("by_date_and_branch", ["dateString", "branchId"]),

  ...governanceTables,
  ...catalogTables,
  ...relationTables,
  ...commitmentTables,
  ...procurementTables,
  ...stockTables,
  ...afterSalesTables,
  ...planningTables,
  ...supplyChainTables,
});
