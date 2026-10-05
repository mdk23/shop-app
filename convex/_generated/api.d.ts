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
import type * as businessRelations from "../businessRelations.js";
import type * as cashRegister from "../cashRegister.js";
import type * as categories from "../categories.js";
import type * as collections from "../collections.js";
import type * as colors from "../colors.js";
import type * as commercialSettings from "../commercialSettings.js";
import type * as complaints from "../complaints.js";
import type * as contactMeans from "../contactMeans.js";
import type * as customerCredits from "../customerCredits.js";
import type * as customerInteractions from "../customerInteractions.js";
import type * as customerOrders from "../customerOrders.js";
import type * as customerProfile from "../customerProfile.js";
import type * as customers from "../customers.js";
import type * as deliveryFees from "../deliveryFees.js";
import type * as devAuth from "../devAuth.js";
import type * as fiscalIdentities from "../fiscalIdentities.js";
import type * as inventory from "../inventory.js";
import type * as lib_catalog from "../lib/catalog.js";
import type * as lib_customers_derive from "../lib/customers/derive.js";
import type * as lib_fiscal from "../lib/fiscal.js";
import type * as lib_phone from "../lib/phone.js";
import type * as lib_receiving from "../lib/receiving.js";
import type * as locations from "../locations.js";
import type * as metrics from "../metrics.js";
import type * as nonConformities from "../nonConformities.js";
import type * as opportunities from "../opportunities.js";
import type * as payments from "../payments.js";
import type * as permissions from "../permissions.js";
import type * as phase1Backfill from "../phase1Backfill.js";
import type * as productImages from "../productImages.js";
import type * as productVariants from "../productVariants.js";
import type * as products from "../products.js";
import type * as promotions from "../promotions.js";
import type * as purchaseOrders from "../purchaseOrders.js";
import type * as purchaseReceipts from "../purchaseReceipts.js";
import type * as receiptInspections from "../receiptInspections.js";
import type * as sales from "../sales.js";
import type * as salesReturns from "../salesReturns.js";
import type * as schemaTables_afterSales from "../schemaTables/afterSales.js";
import type * as schemaTables_catalog from "../schemaTables/catalog.js";
import type * as schemaTables_commitments from "../schemaTables/commitments.js";
import type * as schemaTables_governance from "../schemaTables/governance.js";
import type * as schemaTables_planning from "../schemaTables/planning.js";
import type * as schemaTables_procurement from "../schemaTables/procurement.js";
import type * as schemaTables_relations from "../schemaTables/relations.js";
import type * as schemaTables_stock from "../schemaTables/stock.js";
import type * as schemaTables_supplyChain from "../schemaTables/supplyChain.js";
import type * as seedClothing from "../seedClothing.js";
import type * as settings from "../settings.js";
import type * as shipments from "../shipments.js";
import type * as sizeScales from "../sizeScales.js";
import type * as sizes from "../sizes.js";
import type * as stock from "../stock.js";
import type * as stockAdjustments from "../stockAdjustments.js";
import type * as stockCounts from "../stockCounts.js";
import type * as stockHolds from "../stockHolds.js";
import type * as stockTransfers from "../stockTransfers.js";
import type * as supplierEvaluations from "../supplierEvaluations.js";
import type * as suppliers from "../suppliers.js";
import type * as supplyRelations from "../supplyRelations.js";
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
  businessRelations: typeof businessRelations;
  cashRegister: typeof cashRegister;
  categories: typeof categories;
  collections: typeof collections;
  colors: typeof colors;
  commercialSettings: typeof commercialSettings;
  complaints: typeof complaints;
  contactMeans: typeof contactMeans;
  customerCredits: typeof customerCredits;
  customerInteractions: typeof customerInteractions;
  customerOrders: typeof customerOrders;
  customerProfile: typeof customerProfile;
  customers: typeof customers;
  deliveryFees: typeof deliveryFees;
  devAuth: typeof devAuth;
  fiscalIdentities: typeof fiscalIdentities;
  inventory: typeof inventory;
  "lib/catalog": typeof lib_catalog;
  "lib/customers/derive": typeof lib_customers_derive;
  "lib/fiscal": typeof lib_fiscal;
  "lib/phone": typeof lib_phone;
  "lib/receiving": typeof lib_receiving;
  locations: typeof locations;
  metrics: typeof metrics;
  nonConformities: typeof nonConformities;
  opportunities: typeof opportunities;
  payments: typeof payments;
  permissions: typeof permissions;
  phase1Backfill: typeof phase1Backfill;
  productImages: typeof productImages;
  productVariants: typeof productVariants;
  products: typeof products;
  promotions: typeof promotions;
  purchaseOrders: typeof purchaseOrders;
  purchaseReceipts: typeof purchaseReceipts;
  receiptInspections: typeof receiptInspections;
  sales: typeof sales;
  salesReturns: typeof salesReturns;
  "schemaTables/afterSales": typeof schemaTables_afterSales;
  "schemaTables/catalog": typeof schemaTables_catalog;
  "schemaTables/commitments": typeof schemaTables_commitments;
  "schemaTables/governance": typeof schemaTables_governance;
  "schemaTables/planning": typeof schemaTables_planning;
  "schemaTables/procurement": typeof schemaTables_procurement;
  "schemaTables/relations": typeof schemaTables_relations;
  "schemaTables/stock": typeof schemaTables_stock;
  "schemaTables/supplyChain": typeof schemaTables_supplyChain;
  seedClothing: typeof seedClothing;
  settings: typeof settings;
  shipments: typeof shipments;
  sizeScales: typeof sizeScales;
  sizes: typeof sizes;
  stock: typeof stock;
  stockAdjustments: typeof stockAdjustments;
  stockCounts: typeof stockCounts;
  stockHolds: typeof stockHolds;
  stockTransfers: typeof stockTransfers;
  supplierEvaluations: typeof supplierEvaluations;
  suppliers: typeof suppliers;
  supplyRelations: typeof supplyRelations;
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
