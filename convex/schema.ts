import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ─────────────────────────────────────────────
  // EXISTING TABLES
  // ─────────────────────────────────────────────

  branches: defineTable({
    name: v.string(),
    code: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    isDefault: v.optional(v.boolean()),
    createdAt: v.number(),
  }).index("by_status", ["status"])
    .index("by_code", ["code"]),

  dishes: defineTable({
    name: v.string(),
    price: v.number(),
    category: v.string(), // Chicken, Sandwiches, Drinks, Sides, Combos, Extras
    isActive: v.optional(v.boolean()),
    description: v.optional(v.string()),
    options: v.optional(v.any()), // JSON for flexible options
    // New Combo Architecture
    isCombo: v.optional(v.boolean()),
    selectableInCombo: v.optional(v.boolean()),
    comboRole: v.optional(v.string()), // "Side", "Drink", "Extra"
    comboConfig: v.optional(v.object({
      allowedMains: v.optional(v.array(v.id("dishes"))),
      allowedSides: v.optional(v.array(v.id("dishes"))),
      allowedDrinks: v.optional(v.array(v.id("dishes"))),
      mainsLimit: v.optional(v.number()),
      sidesLimit: v.number(),
      drinksLimit: v.number(),
    })),
    // New Multiple Packaging Configuration
    standalonePackaging: v.optional(v.array(v.object({
      ingredientId: v.id("ingredients"),
      quantity: v.number(),
    }))),
    comboPackaging: v.optional(v.array(v.object({
      ingredientId: v.id("ingredients"),
      quantity: v.number(),
    }))),
  }).index("by_category", ["category"]),

  ingredients: defineTable({
    name: v.string(),
    category: v.string(), // Food, Packaging, Drinks, Kitchen
    stockQuantity: v.number(),
    unit: v.string(), // kg, ml, pcs
    lowStockThreshold: v.number(),
  }),

  dishIngredients: defineTable({
    dishId: v.id("dishes"),
    ingredientId: v.id("ingredients"),
    quantity: v.number(), // Quantity of ingredient used per dish
  }).index("by_dish", ["dishId"])
    .index("by_ingredient", ["ingredientId"]),

  customers: defineTable({
    name: v.string(),
    phone1: v.string(),
    phone2: v.optional(v.string()),
    phone3: v.optional(v.string()),
    isGeneric: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
  }).index("by_phone1", ["phone1"])
    .index("by_isGeneric", ["isGeneric"])
    .searchIndex("search_name", { searchField: "name" }),

  orders: defineTable({
    total: v.number(),
    status: v.string(), // Paid, Partially Paid, Pending
    paymentMethod: v.optional(v.string()), // POS, M-Pesa, etc.
    amountPaid: v.number(),
    customerId: v.id("customers"),
    createdAt: v.number(),
    orderCode: v.optional(v.string()),
    prepStatus: v.optional(v.union(v.literal("pending"), v.literal("preparing"), v.literal("ready"), v.literal("completed"))),
    // Auth fields
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    cashRegisterSessionId: v.optional(v.id("cashRegisterSessions")),
    
    // Delivery fields
    orderType: v.optional(v.string()), // "pickup" | "delivery"
    deliveryFeeId: v.optional(v.id("deliveryFees")),
    deliveryFeeName: v.optional(v.string()),
    deliveryFeeAmount: v.optional(v.number()),
    // Split payments
    splitPayments: v.optional(v.array(v.object({
      method: v.string(),
      amount: v.number(),
    }))),
    customerName: v.optional(v.string()),
    itemSummary: v.optional(v.array(v.object({
      dishId: v.optional(v.id("dishes")),
      dishName: v.string(),
      quantity: v.number(),
    }))),
    branchId: v.optional(v.id("branches")),
  }).index("by_status", ["status"])
    .index("by_customer", ["customerId"])
    .index("by_delivery_fee", ["deliveryFeeId"])
    .index("by_created_at", ["createdAt"])
    .index("by_branch", ["branchId"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
    dishId: v.id("dishes"),
    quantity: v.number(),
    priceAtTime: v.number(),
    modifiers: v.optional(v.array(v.object({
      name: v.string(),
      price: v.number(),
    }))),
    comboSelections: v.optional(v.array(v.object({
      category: v.string(),
      dishId: v.optional(v.id("dishes")),
      name: v.string(),
      extraCharge: v.number(),
    }))),
  }).index("by_order", ["orderId"]),

  payments: defineTable({
    orderId: v.id("orders"),
    method: v.string(),
    amount: v.number(),
    createdAt: v.number(),
  }).index("by_order", ["orderId"]),

  factoryRecipes: defineTable({
    producedIngredientId: v.id("ingredients"),
    outputQuantity: v.number(),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    ingredients: v.array(
      v.object({
        ingredientId: v.id("ingredients"),
        quantity: v.number(),
      })
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
        v.object({
          ingredientId: v.id("ingredients"),
          quantity: v.number(),
        })
      )
    ),
  }).index("by_produced_ingredient", ["producedIngredientId"]),

  // Global app settings (promo toggles, feature flags, etc.)
  settings: defineTable({
    key: v.string(),        // unique identifier e.g. "pizzaPromo"
    isActive: v.boolean(),  // toggle state
    label: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // ─────────────────────────────────────────────
  // AUTH & USER MANAGEMENT TABLES
  // ─────────────────────────────────────────────

  users: defineTable({
    name: v.string(),
    username: v.string(), // lowercase, unique
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
    details: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_action", ["action"])
    .index("by_created_at", ["createdAt"]),

  // ─────────────────────────────────────────────
  // CASH REGISTER (CAIXA) TABLES
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
    // Denormalized totals for fast querying
    cashSalesTotal: v.optional(v.number()),
    cashInTotal: v.optional(v.number()),
    cashOutTotal: v.optional(v.number()),
    expectedCash: v.optional(v.number()),
    salesByUser: v.optional(v.array(v.object({ username: v.string(), amount: v.number() }))),
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
      v.literal("cash_in"),
      v.literal("cash_out"),
      v.literal("closing")
    ),
    amount: v.number(),
    description: v.string(),
    orderId: v.optional(v.id("orders")),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"])
    .index("by_order", ["orderId"]),

  deliveryFees: defineTable({
    name: v.string(),
    fee: v.number(),
    description: v.optional(v.string()),
    active: v.boolean(),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  inventoryMovements: defineTable({
    movementDate: v.number(),
    itemId: v.id("ingredients"),
    itemName: v.string(),
    sku: v.optional(v.string()),
    movementType: v.string(), // e.g., purchase_in, sale_consumption, wastage, etc.
    quantity: v.number(),     // can be negative for outputs
    unit: v.string(),
    previousBalance: v.number(),
    newBalance: v.number(),
    costPerUnit: v.optional(v.number()),
    totalCostImpact: v.optional(v.number()),
    referenceType: v.optional(v.string()), // order, production, manual, waste
    referenceId: v.optional(v.string()),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    createdAt: v.number(),
    branchId: v.optional(v.id("branches")),
  })
    .index("by_item", ["itemId"])
    .index("by_date", ["movementDate"])
    .index("by_type", ["movementType"])
    .index("by_ref", ["referenceType", "referenceId"])
    .index("by_branch", ["branchId"]),

  wasteLogs: defineTable({
    itemId: v.id("ingredients"),
    itemName: v.string(),
    quantity: v.number(),
    unit: v.string(),
    wasteType: v.string(), // Spoiled, Burnt, Expired, Damaged, Theft, Preparation Waste, Unknown Loss
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

  // ─────────────────────────────────────────────
  // COUNTERS (For O(1) Sequences)
  // ─────────────────────────────────────────────
  counters: defineTable({
    key: v.string(),                  // Unique counter identifier
    value: v.number(),                // Current aggregated count/sum
    dateString: v.optional(v.string()), // e.g. "2026-06-24" (only for daily-reset counters)
    updatedAt: v.number(),            // Timestamp of the last write
  }).index("by_key", ["key"]),

  suppliers: defineTable({
    name: v.string(),
    contactName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    paymentTerms: v.optional(v.string()),
    suppliedIngredients: v.optional(v.array(v.id("ingredients"))),
    createdAt: v.number(),
  }).index("by_status", ["status"]),

  purchaseOrders: defineTable({
    supplierId: v.id("suppliers"),
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
    branchId: v.optional(v.id("branches")),
  }).index("by_supplier", ["supplierId"])
    .index("by_status", ["status"])
    .index("by_branch", ["branchId"]),

  purchaseOrderItems: defineTable({
    purchaseOrderId: v.id("purchaseOrders"),
    ingredientId: v.id("ingredients"),
    quantityOrdered: v.number(),
    quantityReceived: v.number(),
    unitCost: v.number(),
    totalCost: v.number(),
  }).index("by_purchase_order", ["purchaseOrderId"]),

  // ─────────────────────────────────────────────
  // ANALYTICS
  // ─────────────────────────────────────────────
  dailyMetrics: defineTable({
    dateString: v.string(), // "YYYY-MM-DD"
    
    // Financial Totals
    grossRevenue: v.number(),
    cashCollected: v.number(),
    outstandingDebt: v.number(),

    deliveryRevenue: v.number(),
    
    // Counts
    orderCount: v.number(),
    cancelledOrderCount: v.number(),
    deliveryOrdersCount: v.number(),
    pickupOrdersCount: v.number(),
    profileSalesCount: v.number(),
    genericSalesCount: v.number(),
    totalItemsSold: v.number(),
    
    // Status Breakdown
    fullyPaidCount: v.number(),
    partiallyPaidCount: v.number(),
    pendingCount: v.number(),
    
    // Wastage
    wasteCount: v.number(),
    wasteCost: v.number(),
    
    // Unique Customers List
    customerIds: v.array(v.string()), // Used to count unique customers served
    
    // Complex Breakdown Objects
    paymentMethods: v.optional(v.record(v.string(), v.object({ amount: v.number(), count: v.number() }))), 
    productSales: v.optional(v.record(v.string(), v.number())),
    categorySales: v.optional(v.record(v.string(), v.number())),
  }).index("by_date", ["dateString"]),
});
