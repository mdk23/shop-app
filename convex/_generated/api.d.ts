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
import type * as auth from "../auth.js";
import type * as authActions from "../authActions.js";
import type * as backfill from "../backfill.js";
import type * as backfillLegacyPackaging from "../backfillLegacyPackaging.js";
import type * as branches from "../branches.js";
import type * as caixa from "../caixa.js";
import type * as customers from "../customers.js";
import type * as debugSessions from "../debugSessions.js";
import type * as deliveryFees from "../deliveryFees.js";
import type * as dishes from "../dishes.js";
import type * as factory from "../factory.js";
import type * as fixMovements from "../fixMovements.js";
import type * as ingredients from "../ingredients.js";
import type * as inventory from "../inventory.js";
import type * as metrics from "../metrics.js";
import type * as orders from "../orders.js";
import type * as payments from "../payments.js";
import type * as purchaseOrders from "../purchaseOrders.js";
import type * as runBackfill from "../runBackfill.js";
import type * as scratch from "../scratch.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
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
  auth: typeof auth;
  authActions: typeof authActions;
  backfill: typeof backfill;
  backfillLegacyPackaging: typeof backfillLegacyPackaging;
  branches: typeof branches;
  caixa: typeof caixa;
  customers: typeof customers;
  debugSessions: typeof debugSessions;
  deliveryFees: typeof deliveryFees;
  dishes: typeof dishes;
  factory: typeof factory;
  fixMovements: typeof fixMovements;
  ingredients: typeof ingredients;
  inventory: typeof inventory;
  metrics: typeof metrics;
  orders: typeof orders;
  payments: typeof payments;
  purchaseOrders: typeof purchaseOrders;
  runBackfill: typeof runBackfill;
  scratch: typeof scratch;
  seed: typeof seed;
  settings: typeof settings;
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
