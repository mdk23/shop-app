"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/utils";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Resolve the branch selector ("all" or an id) into a concrete branch id for
 * mutations that require one — falls back to the default / first active branch.
 */
export function useResolvedBranch(): {
  branchId: Id<"branches"> | undefined;
  branchName: string;
  branches: { _id: Id<"branches">; name: string; code: string }[];
  isAll: boolean;
} {
  const { selectedBranchId, activeBranches } = useBranch();
  const list = (activeBranches ?? []) as {
    _id: Id<"branches">;
    name: string;
    code: string;
    isDefault?: boolean;
  }[];

  const isAll = selectedBranchId === "all";
  let resolved = list.find((b) => b._id === selectedBranchId);
  if (!resolved) resolved = list.find((b) => b.isDefault) ?? list[0];

  return {
    branchId: resolved?._id,
    branchName: resolved?.name ?? "—",
    branches: list.map((b) => ({ _id: b._id, name: b.name, code: b.code })),
    isAll,
  };
}

/** Currency formatter bound to the `currencySymbol` setting. */
export function useCurrency() {
  const setting = useQuery(api.settings.getByKey, { key: "currencySymbol" });
  const symbol = setting?.value || "MT";
  return (amount: number) => formatCurrency(amount, symbol);
}

/** The dev/session token for API calls that require auth. */
export function useToken() {
  const { token } = useAuth();
  return token ?? "";
}
