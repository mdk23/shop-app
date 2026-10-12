import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Stock reserved for customer orders goes back on sale once the reservation expires.
crons.interval("expire stock reservations", { hours: 1 }, internal.stockHolds.expireHolds, {});

export default crons;
