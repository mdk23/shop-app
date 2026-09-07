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
import type * as brands from "../brands.js";
import type * as caixa from "../caixa.js";
import type * as categories from "../categories.js";
import type * as customerCredits from "../customerCredits.js";
import type * as customers from "../customers.js";
import type * as deliveryFees from "../deliveryFees.js";
import type * as devAuth from "../devAuth.js";
import type * as inventory from "../inventory.js";
import type * as metrics from "../metrics.js";
import type * as migrations from "../migrations.js";
import type * as payments from "../payments.js";
import type * as permissions from "../permissions.js";
import type * as productImages from "../productImages.js";
import type * as productVariants from "../productVariants.js";
import type * as products from "../products.js";
import type * as purchaseOrders from "../purchaseOrders.js";
import type * as sales from "../sales.js";
import type * as salesReturns from "../salesReturns.js";
import type * as seedClothing from "../seedClothing.js";
import type * as settings from "../settings.js";
import type * as stock from "../stock.js";
import type * as stockAdjustments from "../stockAdjustments.js";
import type * as stockTransfers from "../stockTransfers.js";
import type * as suppliers from "../suppliers.js";
import type * as users from "../users.js";
import type * as usersActions from "../usersActions.js";

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
  brands: typeof brands;
  caixa: typeof caixa;
  categories: typeof categories;
  customerCredits: typeof customerCredits;
  customers: typeof customers;
  deliveryFees: typeof deliveryFees;
  devAuth: typeof devAuth;
  inventory: typeof inventory;
  metrics: typeof metrics;
  migrations: typeof migrations;
  payments: typeof payments;
  permissions: typeof permissions;
  productImages: typeof productImages;
  productVariants: typeof productVariants;
  products: typeof products;
  purchaseOrders: typeof purchaseOrders;
  sales: typeof sales;
  salesReturns: typeof salesReturns;
  seedClothing: typeof seedClothing;
  settings: typeof settings;
  stock: typeof stock;
  stockAdjustments: typeof stockAdjustments;
  stockTransfers: typeof stockTransfers;
  suppliers: typeof suppliers;
  users: typeof users;
  usersActions: typeof usersActions;
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
