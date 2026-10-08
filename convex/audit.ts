import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Single audit-log writer. Every sensitive mutation (sales, returns, price/cost
 * changes, stock adjustments, transfers, purchasing, cash register, user/settings
 * changes) records an entry here so the trail is uniform and queryable.
 */
export async function writeAudit(
  ctx: MutationCtx,
  entry: {
    userId: Id<"users">;
    username: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: string;
  }
): Promise<Id<"auditLogs">> {
  return await ctx.db.insert("auditLogs", {
    userId: entry.userId,
    username: entry.username,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    details: entry.details,
    createdAt: Date.now(),
  });
}

function auditValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "string") return `"${value}"`;
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  return String(value);
}

/**
 * What an update changed, for an audit entry: `sellingPrice 250 → 300; name "A" → "B"`.
 * `changes` is the patch being applied (a key set to undefined clears the field); keys
 * whose value is unchanged are left out. Returns "" when nothing changed.
 */
export function describeChanges(
  before: Record<string, unknown>,
  changes: Record<string, unknown>,
  ignore: string[] = ["updatedAt"]
): string {
  return Object.keys(changes)
    .filter((key) => !ignore.includes(key))
    .filter((key) => JSON.stringify(changes[key]) !== JSON.stringify(before[key]))
    .map((key) => `${key} ${auditValue(before[key])} → ${auditValue(changes[key])}`)
    .join("; ");
}
