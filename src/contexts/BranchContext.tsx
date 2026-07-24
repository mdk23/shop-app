"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

interface BranchContextType {
  selectedBranchId: string; // "all" or specific branch ID
  setSelectedBranchId: (branchId: string) => void;
  isMultiBranchEnabled: boolean;
  activeBranches: any[] | undefined;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

const STORAGE_KEY = "takeaway_app_selected_branch";

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const [selectedBranchId, setSelectedBranchIdState] = useState<string>("all");

  // Query global settings to check if Multi-Branch mode is active
  const multiBranchSetting = useQuery(api.settings.getAll);
  const activeBranches = useQuery(api.branches.listActive);

  const isMultiBranchEnabled = React.useMemo(() => {
    if (!multiBranchSetting) return false;
    const settingObj = multiBranchSetting.find((s: any) => s.key === "enableMultiBranch");
    return settingObj ? settingObj.isActive : false;
  }, [multiBranchSetting]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setSelectedBranchIdState(saved);
    }
  }, []);

  const setSelectedBranchId = (branchId: string) => {
    setSelectedBranchIdState(branchId);
    localStorage.setItem(STORAGE_KEY, branchId);
  };

  return (
    <BranchContext.Provider
      value={{
        selectedBranchId: isMultiBranchEnabled ? selectedBranchId : "all",
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
