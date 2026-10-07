import type { Doc } from "../../convex/_generated/dataModel";

export type DemandStage = Doc<"demands">["stage"];
export type DemandReason = NonNullable<Doc<"demands">["reason"]>;

/** Why a sale did not happen — one list for Procuras, Oportunidades and Insights. */
export const DEMAND_REASONS: { value: DemandReason; label: string }[] = [
  { value: "SIZE", label: "Size not available" },
  { value: "COLOR", label: "Color not available" },
  { value: "PRICE", label: "Price too high" },
  { value: "STOCK", label: "Not in stock" },
  { value: "OTHER", label: "Other" },
];

export const DEMAND_REASON_LABEL = Object.fromEntries(
  DEMAND_REASONS.map((r) => [r.value, r.label])
) as Record<DemandReason, string>;

export const DEMAND_STAGE_LABEL: Record<DemandStage, string> = {
  OPEN: "Open",
  PROCEEDING: "Proceeding",
  CONVERTED: "Converted",
  FULFILLED: "Fulfilled",
  LOST: "Lost",
};

export const DEMAND_STAGE_TONE: Record<DemandStage, "info" | "warning" | "success" | "error"> = {
  OPEN: "info",
  PROCEEDING: "warning",
  CONVERTED: "success",
  FULFILLED: "success",
  LOST: "error",
};

export const isClosedStage = (stage: DemandStage) =>
  stage === "CONVERTED" || stage === "FULFILLED" || stage === "LOST";
