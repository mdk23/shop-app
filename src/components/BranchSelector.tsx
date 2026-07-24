"use client";

import React, { useState, useRef, useEffect } from "react";
import { useBranch } from "@/contexts/BranchContext";
import { Store, ChevronDown, Check, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export function BranchSelector({ compact = false }: { compact?: boolean }) {
  const {
    selectedBranchId,
    setSelectedBranchId,
    isMultiBranchEnabled,
    activeBranches,
  } = useBranch();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isMultiBranchEnabled) return null;

  const currentBranch =
    selectedBranchId === "all"
      ? null
      : activeBranches?.find((b: any) => b._id === selectedBranchId);

  return (
    <div className="relative z-50" ref={dropdownRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        id="branch-selector-btn"
        className={cn(
          "flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-surface border border-outline/30 hover:bg-surface-container hover:border-outline/50 transition-all cursor-pointer shadow-sm",
          compact && "p-2"
        )}
        title="Switch Branch View"
      >
        <div className="flex items-center gap-1.5 text-primary">
          {selectedBranchId === "all" ? (
            <Globe className="w-4 h-4" />
          ) : (
            <Store className="w-4 h-4" />
          )}
        </div>

        {!compact && (
          <span className="text-[11px] font-bold text-on-surface uppercase tracking-wider hidden sm:inline max-w-[120px] truncate">
            {selectedBranchId === "all"
              ? "All Branches"
              : currentBranch?.name || "Select Branch"}
          </span>
        )}

        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-on-surface-variant transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-surface/95 backdrop-blur-xl border border-outline/30 rounded-2xl shadow-xl z-[100] overflow-hidden p-2 space-y-1">
          <div className="px-3 py-2 border-b border-outline/20 mb-1">
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
              STORE BRANCH VIEW
            </p>
            <p className="text-xs text-on-surface font-semibold">
              Filter data by store location
            </p>
          </div>

          {/* All Branches Option */}
          <button
            onClick={() => {
              setSelectedBranchId("all");
              setOpen(false);
            }}
            className={cn(
              "w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between group cursor-pointer",
              selectedBranchId === "all"
                ? "bg-primary/10 border-primary/40 shadow-sm"
                : "border-transparent hover:bg-surface-container/70"
            )}
          >
            <div className="flex items-center gap-2.5">
              <Globe className="w-4 h-4 text-primary" />
              <div>
                <p className="text-xs font-bold text-on-surface group-hover:text-primary transition-colors">
                  All Branches
                </p>
                <p className="text-[9px] text-on-surface-variant font-medium">
                  Combined multi-store view
                </p>
              </div>
            </div>
            {selectedBranchId === "all" && (
              <div className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            )}
          </button>

          {/* Active Store Branches */}
          {activeBranches && activeBranches.length > 0 && (
            <div className="border-t border-outline/20 pt-1 space-y-1">
              {activeBranches.map((branch: any) => {
                const isSelected = selectedBranchId === branch._id;
                return (
                  <button
                    key={branch._id}
                    onClick={() => {
                      setSelectedBranchId(branch._id);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between group cursor-pointer",
                      isSelected
                        ? "bg-primary/10 border-primary/40 shadow-sm"
                        : "border-transparent hover:bg-surface-container/70"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Store className="w-4 h-4 text-primary" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-on-surface group-hover:text-primary transition-colors">
                            {branch.name}
                          </p>
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-surface-container-high text-on-surface-variant border border-outline/20">
                            {branch.code}
                          </span>
                        </div>
                        {branch.address && (
                          <p className="text-[9px] text-on-surface-variant line-clamp-1 font-medium">
                            {branch.address}
                          </p>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
