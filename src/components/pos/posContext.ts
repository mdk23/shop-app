import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Shape of `api.customers.getPosContext`'s return value, hand-typed to match
 * (the codebase's convention for shared query shapes — see e.g. `ProductRow`
 * in `src/app/products/page.tsx`). Shared by the POS rail and the Ficha do
 * Cliente (Phase 11), since both consume the same query.
 */

export type Tier = "NOVO" | "REGULAR" | "VIP";

export type PosContextCustomer = {
  _id: Id<"customers">;
  name: string;
  firstName: string;
  phone1: string;
  photoUrl?: string;
  initials: string;
  tier: Tier;
  isGeneric: boolean;
  customerCode?: string;
  email?: string;
  notes?: string;
  whatsappOptIn: boolean;
  preferredGender?: "women" | "men" | "unisex";
  preferredSports: string[];
  preferredColorIds: Id<"colors">[];
  preferredColorNames: string[];
  preferredCategoryIds: Id<"categories">[];
  preferredCategoryNames: string[];
  preferredBrands: string[];
  // Tier 3 — derived-only, never editable. See convex/customerProfile.ts.
  topCategoryName?: string;
  topColorName?: string;
};

export type PosContextSizeRow = {
  _id: Id<"customerSizeProfiles">;
  categoryId: Id<"categories">;
  categoryName: string;
  sizeId: Id<"sizes">;
  sizeName: string;
  confidence: "CONFIRMADO" | "INFERIDO";
  updatedAt: number;
};

export type PosContextSaleLine = {
  saleItemId: Id<"saleItems">;
  productVariantId: Id<"productVariants">;
  productId: Id<"products"> | undefined;
  productName: string;
  variantLabel: string;
  sizeName?: string;
  colorName?: string;
  unitPrice: number;
  quantity: number;
  variantActive: boolean;
  stockAtBranch: number | null;
};

export type PosContextSale = {
  saleId: Id<"sales">;
  saleNumber: string;
  createdAt: number;
  total: number;
  status: string;
  hasReturns: boolean;
  lines: PosContextSaleLine[];
};

export type PosContext = {
  customer: PosContextCustomer | null;
  money: {
    storeCredit: number;
    outstandingDebt: number;
    lifetimeSpend: number;
    saleCount: number;
    avgTicket: number;
    firstPurchase: number | null;
    lastPurchase: number | null;
    // Tier 3 — derived-only.
    returnRatePercent: number;
    purchaseFrequencyPerMonth: number;
  };
  sizes: PosContextSizeRow[];
  recentSales: PosContextSale[];
  tierDiscountPercent: number;
};
