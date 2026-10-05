/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as authActions from "../authActions.js";
import type * as branches from "../branches.js";
import type * as cashRegister from "../cashRegister.js";
import type * as categories from "../categories.js";
import type * as collections from "../collections.js";
import type * as colors from "../colors.js";
import type * as customerCredits from "../customerCredits.js";
import type * as customerInteractions from "../customerInteractions.js";
import type * as customerProfile from "../customerProfile.js";
import type * as customers from "../customers.js";
import type * as deliveryFees from "../deliveryFees.js";
import type * as devAuth from "../devAuth.js";
import type * as inventory from "../inventory.js";
import type * as lib_catalog from "../lib/catalog.js";
import type * as lib_customers_derive from "../lib/customers/derive.js";
import type * as lib_fiscal from "../lib/fiscal.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_receiving from "../lib/receiving.js";
import type * as metrics from "../metrics.js";
import type * as payments from "../payments.js";
import type * as permissions from "../permissions.js";
import type * as phase1Backfill from "../phase1Backfill.js";
import type * as productImages from "../productImages.js";
import type * as productVariants from "../productVariants.js";
import type * as products from "../products.js";
import type * as promotions from "../promotions.js";
import type * as purchaseOrders from "../purchaseOrders.js";
import type * as purchaseReceipts from "../purchaseReceipts.js";
import type * as sales from "../sales.js";
import type * as salesReturns from "../salesReturns.js";
import type * as seedClothing from "../seedClothing.js";
import type * as settings from "../settings.js";
import type * as sizeScales from "../sizeScales.js";
import type * as sizes from "../sizes.js";
import type * as stock from "../stock.js";
import type * as stockAdjustments from "../stockAdjustments.js";
import type * as stockCounts from "../stockCounts.js";
import type * as stockTransfers from "../stockTransfers.js";
import type * as suppliers from "../suppliers.js";
import type * as taxRates from "../taxRates.js";
import type * as users from "../users.js";
import type * as usersActions from "../usersActions.js";
import type * as wantList from "../wantList.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  audit: typeof audit;
  auth: typeof auth;
  authActions: typeof authActions;
  branches: typeof branches;
  cashRegister: typeof cashRegister;
  categories: typeof categories;
  collections: typeof collections;
  colors: typeof colors;
  customerCredits: typeof customerCredits;
  customerInteractions: typeof customerInteractions;
  customerProfile: typeof customerProfile;
  customers: typeof customers;
  deliveryFees: typeof deliveryFees;
  devAuth: typeof devAuth;
  inventory: typeof inventory;
  "lib/catalog": typeof lib_catalog;
  "lib/customers/derive": typeof lib_customers_derive;
  "lib/fiscal": typeof lib_fiscal;
  "lib/phone": typeof lib_phone;
  "lib/receiving": typeof lib_receiving;
  metrics: typeof metrics;
  payments: typeof payments;
  permissions: typeof permissions;
  phase1Backfill: typeof phase1Backfill;
  productImages: typeof productImages;
  productVariants: typeof productVariants;
  products: typeof products;
  promotions: typeof promotions;
  purchaseOrders: typeof purchaseOrders;
  purchaseReceipts: typeof purchaseReceipts;
  sales: typeof sales;
  salesReturns: typeof salesReturns;
  seedClothing: typeof seedClothing;
  settings: typeof settings;
  sizeScales: typeof sizeScales;
  sizes: typeof sizes;
  stock: typeof stock;
  stockAdjustments: typeof stockAdjustments;
  stockCounts: typeof stockCounts;
  stockTransfers: typeof stockTransfers;
  suppliers: typeof suppliers;
  taxRates: typeof taxRates;
  users: typeof users;
  usersActions: typeof usersActions;
  wantList: typeof wantList;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
