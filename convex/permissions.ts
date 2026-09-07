import { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { validateToken } from "./auth";

/**
 * Server-side role → permission map. This is the authority; the client mirror in
 * `src/contexts/AuthContext.tsx` is only for hiding UI. Never trust the frontend
 * to authorize a sensitive action — every such mutation calls `authorize()` or
 * `requirePermission()` here.
 */

export type Role = "admin" | "manager" | "pos_seller";

export type Permission =
  // Catalog
  | "products.view"
  | "products.manage"
  | "products.delete"
  | "products.change_cost"
  // Inventory
  | "inventory.view"
  | "inventory.adjust"
  | "inventory.transfer"
  // Purchasing
  | "purchasing.view"
  | "purchasing.manage"
  | "purchasing.receive"
  // Suppliers
  | "suppliers.view"
  | "suppliers.manage"
  // Sales / POS
  | "pos.use"
  | "sales.view"
  | "sales.cancel"
  | "sales.discount"
  | "sales.discount_large"
  | "payments.modify"
  // Returns / exchanges
  | "returns.view"
  | "returns.process"
  | "returns.approve"
  // Customers / CRM
  | "customers.view"
  | "customers.manage"
  | "customers.credit_grant"
  // Cash register
  | "cash_register.use"
  | "cash_register.close"
  | "cash_register.reports"
  // Reporting / admin
  | "reports.view"
  | "users.manage"
  | "settings.manage"
  | "audit.view";

const MANAGER_PERMISSIONS: Permission[] = [
  "products.view",
  "products.manage",
  "products.change_cost",
  "inventory.view",
  "inventory.adjust",
  "inventory.transfer",
  "purchasing.view",
  "purchasing.manage",
  "purchasing.receive",
  "suppliers.view",
  "suppliers.manage",
  "pos.use",
  "sales.view",
  "sales.cancel",
  "sales.discount",
  "sales.discount_large",
  "payments.modify",
  "returns.view",
  "returns.process",
  "returns.approve",
  "customers.view",
  "customers.manage",
  "customers.credit_grant",
  "cash_register.use",
  "cash_register.close",
  "cash_register.reports",
  "reports.view",
  "audit.view",
];

const POS_SELLER_PERMISSIONS: Permission[] = [
  "products.view",
  "inventory.view",
  "pos.use",
  "sales.view",
  "sales.discount",
  "returns.view",
  "returns.process",
  "customers.view",
  "customers.manage",
  "cash_register.use",
];

const ALL_PERMISSIONS: Permission[] = [
  ...MANAGER_PERMISSIONS,
  "products.delete",
  "users.manage",
  "settings.manage",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  pos_seller: POS_SELLER_PERMISSIONS,
};

export function getPermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return getPermissions(role).includes(permission);
}

export function userHasPermission(
  user: Pick<Doc<"users">, "role">,
  permission: Permission
): boolean {
  return roleHasPermission(user.role, permission);
}

/** Throw unless the user's role grants `permission`. */
export function requirePermission(
  user: Pick<Doc<"users">, "role" | "username">,
  permission: Permission
): void {
  if (!roleHasPermission(user.role, permission)) {
    throw new Error(
      `Access denied: "${user.username}" (${user.role}) lacks permission "${permission}".`
    );
  }
}

/** Throw unless the user's role is one of `roles`. */
export function requireRole(
  user: Pick<Doc<"users">, "role" | "username">,
  roles: Role[]
): void {
  if (!roles.includes(user.role)) {
    throw new Error(
      `Access denied: "${user.username}" (${user.role}) is not one of [${roles.join(", ")}].`
    );
  }
}

/**
 * Validate a session token and assert a permission in one call.
 * Returns the authenticated user document.
 */
export async function authorize(
  ctx: QueryCtx | MutationCtx,
  token: string,
  permission: Permission
): Promise<Doc<"users">> {
  const user = await validateToken(ctx, token);
  requirePermission(user, permission);
  return user;
}
