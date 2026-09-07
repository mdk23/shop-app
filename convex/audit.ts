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
