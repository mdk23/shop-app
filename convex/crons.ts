import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Stock reserved for customer orders goes back on sale once the reservation expires.
crons.interval("expire stock reservations", { hours: 1 }, internal.stockHolds.expireHolds, {});

// Every night: check that stored copies (stock, sale money, received quantities) still
// match their source. 01:00 UTC is 03:00 in Maputo.
crons.cron("check stored copies", "0 1 * * *", internal.integrity.start, {});

export default crons;
