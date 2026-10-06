"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

interface BranchContextType {
  selectedBranchId: string; // "all" or specific branch ID
  setSelectedBranchId: (branchId: string) => void;
  isMultiBranchEnabled: boolean;
  activeBranches: Doc<"branches">[] | undefined;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

const STORAGE_KEY = "takeaway_app_selected_branch";
const CHANGE_EVENT = "takeaway-branch-change";

// The selection lives in localStorage. Reading it through useSyncExternalStore avoids an
// effect, and the server render uses "all", so there is no hydration mismatch.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}
const readSelection = () => localStorage.getItem(STORAGE_KEY) || "all";
const serverSelection = () => "all";

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const selectedBranchId = useSyncExternalStore(subscribe, readSelection, serverSelection);

  const activeBranches = useQuery(api.branches.listActive);
  const isMultiBranchEnabled = true;

  const setSelectedBranchId = (branchId: string) => {
    localStorage.setItem(STORAGE_KEY, branchId);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <BranchContext.Provider
      value={{
        selectedBranchId,
        setSelectedBranchId,
        isMultiBranchEnabled,
        activeBranches,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error("useBranch must be used within a BranchProvider");
  }
  return context;
}
