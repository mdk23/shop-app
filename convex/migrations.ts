import { internalMutation } from "./_generated/server";

// One-off: uppercase status values, drop currency ids. Delete after it has run.
export const normalizeStatusesAndCurrency = internalMutation({
  args: {},
  handler: async (ctx) => {
    const counts: Record<string, number> = {};
    const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

    for (const row of await ctx.db.query("suppliers").collect()) {
      const status = row.status.toUpperCase() as "ACTIVE" | "INACTIVE";
      if (status !== row.status) (await ctx.db.patch(row._id, { status }), bump("suppliers"));
    }
    for (const row of await ctx.db.query("users").collect()) {
      const status = row.status.toUpperCase() as "ACTIVE" | "DISABLED";
      if (status !== row.status) (await ctx.db.patch(row._id, { status }), bump("users"));
    }
    for (const row of await ctx.db.query("branches").collect()) {
      const status = row.status.toUpperCase() as "ACTIVE" | "INACTIVE";
      if (status !== row.status) (await ctx.db.patch(row._id, { status }), bump("branches"));
    }
    for (const row of await ctx.db.query("customers").collect()) {
      if (!row.status) continue;
      const status = row.status.toUpperCase() as "ACTIVE" | "ARCHIVED";
      if (status !== row.status) (await ctx.db.patch(row._id, { status }), bump("customers"));
    }
    for (const row of await ctx.db.query("cashRegisterSessions").collect()) {
      const status = row.status.toUpperCase() as "OPEN" | "CLOSED";
      if (status !== row.status) (await ctx.db.patch(row._id, { status }), bump("cashRegisterSessions"));
    }
    for (const row of await ctx.db.query("landedCostComponents").collect()) {
      if (row.currencyId !== undefined) {
        await ctx.db.patch(row._id, { currencyId: undefined });
        bump("landedCostComponents");
      }
    }
    for (const row of await ctx.db.query("currencies").collect()) {
      await ctx.db.delete(row._id);
      bump("currencies deleted");
    }
    return counts;
  },
});
