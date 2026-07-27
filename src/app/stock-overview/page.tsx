"use client";

import React, { useState, useMemo } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { LogWasteModal } from "@/components/LogWasteModal";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Download,
  ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Extracted Sub-components
import { StockKpiCards } from "@/components/stock-overview/StockKpiCards";
import { StockLedgerCharts } from "@/components/stock-overview/StockLedgerCharts";
import { StockFiltersRibbon } from "@/components/stock-overview/StockFiltersRibbon";
import { StockLedgerTable } from "@/components/stock-overview/StockLedgerTable";

export default function StockOverviewPage() {
  const { currentUser, token } = useAuth();

  // Modals state
  const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState("All");
  const [refTypeFilter, setRefTypeFilter] = useState("All");
  const [selectedItemId, setSelectedItemId] = useState("All");
  const [selectedUser, setSelectedUser] = useState("All");
  const [timeFilter, setTimeFilter] = useState<"Today" | "Week" | "Month" | "All">("Month");

  // Sorting state
  const [sortField, setSortField] = useState<"date" | "qty" | "item" | null>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Resolve start/end timestamps based on selected time filter
  const timeRange = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    if (timeFilter === "Today") {
      return { start: startOfToday, end: now };
    } else if (timeFilter === "Week") {
      return { start: now - 7 * 24 * 60 * 60 * 1000, end: now };
    } else if (timeFilter === "Month") {
      return { start: now - 30 * 24 * 60 * 60 * 1000, end: now };
    }
    return { start: 0, end: now + 86400000 };
  }, [timeFilter]);

  // Queries
  const ingredients = useQuery(api.ingredients.list);
  const movements = useQuery(api.inventory.listMovements, {
    start: timeRange.start,
    movementType: movementTypeFilter === "All" ? undefined : movementTypeFilter,
    itemId: selectedItemId === "All" ? undefined : (selectedItemId as any),
    username: selectedUser === "All" ? undefined : selectedUser,
    referenceType: refTypeFilter === "All" ? undefined : refTypeFilter,
  });

  const wastageMetrics = useQuery(api.inventory.getWastageMetrics, {
    start: timeRange.start,
  });

  // Mutations
  const softDeleteAdjustment = useMutation(api.inventory.softDeleteAdjustment);

  // Extract unique users from ingredients/movements for filters list
  const filterUsersList = useMemo(() => {
    if (!movements) return [];
    const usersSet = new Set<string>();
    movements.forEach((m) => {
      if (m.username) usersSet.add(m.username);
    });
    return Array.from(usersSet);
  }, [movements]);

  // Handle Search and in-memory sorting of movements
  const filteredAndSortedMovements = useMemo(() => {
    if (!movements) return [];
    let result = movements;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (m) =>
          m.itemName.toLowerCase().includes(q) ||
          (m.referenceId && m.referenceId.toLowerCase().includes(q)) ||
          (m.notes && m.notes.toLowerCase().includes(q))
      );
    }

    if (sortField) {
      result = [...result].sort((a, b) => {
        let valA: any = "";
        let valB: any = "";
        if (sortField === "date") {
          valA = a.movementDate;
          valB = b.movementDate;
          return sortOrder === "asc" ? valA - valB : valB - valA;
        } else if (sortField === "qty") {
          valA = a.quantity;
          valB = b.quantity;
          return sortOrder === "asc" ? valA - valB : valB - valA;
        } else if (sortField === "item") {
          valA = a.itemName;
          valB = b.itemName;
          return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
      });
    }

    return result;
  }, [movements, searchTerm, sortField, sortOrder]);

  // Paginated movements
  const paginatedMovements = useMemo(() => {
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredAndSortedMovements.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  }, [filteredAndSortedMovements, currentPage]);

  const totalPages = Math.ceil(filteredAndSortedMovements.length / ITEMS_PER_PAGE);

  // Handle Sorting Toggles
  const handleSort = (field: "date" | "qty" | "item") => {
    if (sortField === field) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const renderSortIndicator = (field: "date" | "qty" | "item") => {
    if (sortField !== field) return <ChevronsUpDown className="w-3.5 h-3.5 ml-1 opacity-40" />;
    return sortOrder === "asc" ? (
      <ArrowUpRight className="w-3.5 h-3.5 ml-1 text-primary rotate-45" />
    ) : (
      <ArrowDownRight className="w-3.5 h-3.5 ml-1 text-primary rotate-45" />
    );
  };

  // Perform soft delete
  const handleDelete = async (movementId: any) => {
    if (!token) return;
    if (!confirm("Are you sure you want to soft-delete this manual stock adjustment log?")) return;

    try {
      await softDeleteAdjustment({ token, movementId });
      toast.success("Adjustment log soft-deleted.");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete log");
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredAndSortedMovements.length === 0) {
      toast.info("No logs in current range to export.");
      return;
    }

    const headers = [
      "Date & Time",
      "Movement Type",
      "Item Name",
      "Qty Change",
      "Unit",
      "Prev Balance",
      "New Balance",
      "Reference Type",
      "Reference ID",
      "User",
      "Notes",
    ];

    const rows = filteredAndSortedMovements.map((m) => [
      format(m.movementDate, "yyyy-MM-dd HH:mm:ss"),
      m.movementType,
      m.itemName,
      m.quantity,
      m.unit,
      m.previousBalance,
      m.newBalance,
      m.referenceType || "N/A",
      m.referenceId || "N/A",
      m.username || "System",
      m.notes || "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((r) =>
        r
          .map((v) => {
            const s = String(v);
            if (s.includes(",") || s.includes('"') || s.includes("\n")) {
              return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `inventory_ledger_${timeFilter}_${format(new Date(), "yyyyMMdd")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format type displays helper
  const formatType = (type: string) => {
    return type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // Derived KPIs
  const activeSkuCount = ingredients?.length || 0;
  const lowStockCount =
    ingredients?.filter((i) => i.stockQuantity <= i.lowStockThreshold && i.stockQuantity > 0).length || 0;
  const outOfStockCount = ingredients?.filter((i) => i.stockQuantity <= 0).length || 0;

  return (
    <PageLayout title="Stock Overview" subtitle="Audit Trail & Kitchen Loss Overview" isFullWidth={true}>
      <div className="space-y-6 pb-12">
        {/* Header Actions */}
        <div className="flex justify-end items-center gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {currentUser?.role !== "pos_seller" && (
              <button
                onClick={() => setIsWasteModalOpen(true)}
                className="bg-primary text-on-primary px-6 py-3.5 bg-black text-white hover:bg-neutral-800 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 transition-all shadow-hard active:scale-95 border border-outline w-full sm:w-auto"
              >
                <Plus className="w-5 h-5" />
                Log Wastage
              </button>
            )}
            <button
              onClick={handleExportCSV}
              className="px-5 py-3.5 bg-surface border-2 border-outline rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-surface-container-high transition-all shadow-hard active:scale-95 w-full sm:w-auto flex items-center justify-center gap-2 text-on-surface"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Global Time Filter Ribbon */}
        <div className="flex flex-wrap items-center justify-between bg-surface-container border-2 border-outline rounded-2xl p-4 gap-4 shadow-hard">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-75">
              LEDGER RANGE:
            </span>
            <div className="flex bg-surface border-2 border-outline rounded-xl p-1 gap-1">
              {(["Today", "Week", "Month", "All"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setTimeFilter(type);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all",
                    timeFilter === type ? "bg-black text-white" : "text-on-surface hover:text-primary"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div className="text-[10px] font-bold text-on-surface-variant uppercase">
            Active session: <strong className="text-black">@{currentUser?.username || "Guest"}</strong> ({formatType(currentUser?.role || "")})
          </div>
        </div>

        {/* Top KPI Cards */}
        <StockKpiCards
          activeSkuCount={activeSkuCount}
          lowStockCount={lowStockCount}
          outOfStockCount={outOfStockCount}
          wastageMetrics={wastageMetrics}
          timeFilter={timeFilter}
        />

        {/* Analytics Section */}
        <StockLedgerCharts wastageMetrics={wastageMetrics} formatType={formatType} />

        {/* Ledger Logs Table section */}
        <div className="bg-surface border-2 border-outline rounded-2xl shadow-hard overflow-hidden flex flex-col min-h-[500px]">
          {/* Filters Ribbon Header */}
          <div className="p-4 lg:p-6 border-b border-outline bg-surface-container flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] flex items-center gap-2">
                <History className="w-4 h-4" />
                Movement Ledger ({filteredAndSortedMovements.length})
              </h3>
              <span className="text-[10px] font-black text-on-surface-variant opacity-50 uppercase tracking-widest">
                Page {currentPage} of {Math.max(1, totalPages)}
              </span>
            </div>

            {/* Filter controls */}
            <StockFiltersRibbon
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              movementTypeFilter={movementTypeFilter}
              setMovementTypeFilter={setMovementTypeFilter}
              selectedItemId={selectedItemId}
              setSelectedItemId={setSelectedItemId}
              refTypeFilter={refTypeFilter}
              setRefTypeFilter={setRefTypeFilter}
              selectedUser={selectedUser}
              setSelectedUser={setSelectedUser}
              ingredients={ingredients}
              filterUsersList={filterUsersList}
              setCurrentPage={setCurrentPage}
            />
          </div>

          {/* Table Contents */}
          <StockLedgerTable
            filteredAndSortedMovements={filteredAndSortedMovements}
            paginatedMovements={paginatedMovements}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            totalPages={totalPages}
            ITEMS_PER_PAGE={ITEMS_PER_PAGE}
            currentUser={currentUser}
            handleSort={handleSort}
            renderSortIndicator={renderSortIndicator}
            handleDelete={handleDelete}
            formatType={formatType}
          />
        </div>
      </div>

      {/* Log Wastage Modal */}
      <LogWasteModal isOpen={isWasteModalOpen} onClose={() => setIsWasteModalOpen(false)} />
    </PageLayout>
  );
}
