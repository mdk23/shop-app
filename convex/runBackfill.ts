import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";

export const runBackfill = action({
  args: {},
  handler: async (ctx): Promise<any> => {
    // 1. Get the open session via internal reference
    const sessions: any[] = await ctx.runQuery(internal.debugSessions.debugOpenSessions);
    if (sessions.length === 0) {
      return "No open sessions found.";
    }
    
    const activeSession: any = sessions[0];
    
    // 2. Call the backfill mutation
    const result: any = await ctx.runMutation(api.fixMovements.backfillCashMovements, {
      startTime: activeSession.openedAt,
    });
    
    return result;
  },
});


