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
  TrendingUp,
  AlertTriangle,
  Trash2,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  History,
  Activity,
  ChevronRight,
  Download,
  Search,
  Filter,
  RefreshCw,
  User,
  ExternalLink,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const CHART_COLORS = ["#FF6B35", "#4ECDC4", "#FFD93D", "#6B5B95", "#88D8B0"];

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
    <PageLayout isFullWidth={true}>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl lg:text-3xl font-black text-on-surface uppercase tracking-tight">
              Stock Ledger & Wastage
            </h2>
            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest opacity-60">
              Audit trail & daily kitchen loss overview
            </p>
          </div>
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

        {/* Top KPI Cards (4 columns grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Active SKUs */}
          <div className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider mb-1">
                Active SKU Count
              </p>
              <h3 className="text-3xl font-black text-on-surface tracking-tighter">{activeSkuCount}</h3>
              <span className="text-[9px] text-green-600 font-bold flex items-center gap-1 mt-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> Checked & active in recipe-book
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-surface-container border border-outline flex items-center justify-center text-on-surface-variant">
              <Package className="w-6 h-6" />
            </div>
          </div>

          {/* Low Stock Alerts */}
          <div className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider mb-1">
                Low Stock Alerts
              </p>
              <h3 className="text-3xl font-black text-error tracking-tighter text-red-600">
                {lowStockCount + outOfStockCount}
              </h3>
              <span className="text-[9px] text-red-600 font-bold flex items-center gap-1 mt-1">
                <AlertTriangle className="w-3.5 h-3.5" /> {outOfStockCount} items completely depleted
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-100 border border-red-300 flex items-center justify-center text-red-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>

          {/* Wastage Logged */}
          <div className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider mb-1">
                Wastage (Selected Period)
              </p>
              <h3 className="text-3xl font-black text-on-surface tracking-tighter">
                {timeFilter === "Today"
                  ? `${wastageMetrics?.totalTodayQty.toFixed(1) || 0} units`
                  : timeFilter === "Week"
                    ? `${wastageMetrics?.totalWeekQty.toFixed(1) || 0} units`
                    : `${wastageMetrics?.totalMonthQty.toFixed(1) || 0} units`}
              </h3>
              <span className="text-[9px] text-on-surface-variant opacity-60 font-bold flex items-center gap-1 mt-1">
                From kitchen losses & spoiled food items
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-surface-container border border-outline flex items-center justify-center text-on-surface-variant">
              <Trash2 className="w-6 h-6" />
            </div>
          </div>

          {/* Waste % */}
          <div className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider mb-1">
                Waste Share %
              </p>
              <h3 className="text-3xl font-black text-on-surface tracking-tighter">
                {wastageMetrics?.wastePercentage.toFixed(1) || 0}%
              </h3>
              <span className="text-[9px] text-green-600 font-bold flex items-center gap-1 mt-1">
                Relative to total stock consumption
              </span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-surface-container border border-outline flex items-center justify-center text-on-surface-variant">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Analytics Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Movement Breakdown Chart */}
          <div className="lg:col-span-2 bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Ledger Movements Breakdown
              </h3>
              <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mb-6">
                Relative quantities consumed/received during this period
              </p>
            </div>
            <div className="h-[250px] w-full">
              {wastageMetrics?.breakdownChartData &&
                wastageMetrics.breakdownChartData.some((c) => c.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={wastageMetrics.breakdownChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="name"
                      stroke="var(--color-on-surface-variant)"
                      fontSize={9}
                      fontWeight={800}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => formatType(v)}
                    />
                    <YAxis stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-surface-container-highest)",
                        border: "2px solid var(--color-outline)",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: "bold",
                      }}
                    />
                    <Bar dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]} name="Volume Impact" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center border border-dashed border-outline rounded-2xl bg-surface-container-high/20 text-on-surface-variant/40 font-black uppercase text-[10px] tracking-wider">
                  No movement logs recorded
                </div>
              )}
            </div>
          </div>

          {/* Top Wasted Items Widget */}
          <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-error" />
                Top Wasted Items
              </h3>
              <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mb-4">
                Highest quantity waste categories
              </p>
            </div>
            <div className="flex-1 overflow-auto max-h-[250px] space-y-2">
              {wastageMetrics?.topWasted && wastageMetrics.topWasted.length > 0 ? (
                <table className="w-full text-left text-[11px] font-bold">
                  <thead>
                    <tr className="border-b border-outline-variant text-[9px] uppercase tracking-wider text-on-surface-variant">
                      <th className="pb-2">Item</th>
                      <th className="pb-2 text-right">Qty</th>
                      <th className="pb-2 text-right">Occurrences</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {wastageMetrics.topWasted.map((item, idx) => (
                      <tr key={idx} className="hover:bg-surface-container-high/20">
                        <td className="py-2.5 truncate max-w-[120px] uppercase font-black">{item.name}</td>
                        <td className="py-2.5 text-right font-display text-primary">{item.quantity} {item.unit}</td>
                        <td className="py-2.5 text-right opacity-60">{item.occurrences} logs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="h-full flex items-center justify-center text-on-surface-variant/40 font-black uppercase text-[10px] tracking-wider py-12">
                  No wastage logged
                </div>
              )}
            </div>
          </div>
        </div>

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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant opacity-40" />
                <input
                  type="text"
                  placeholder="SEARCH ITEM, NOTES..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-surface border-2 border-outline rounded-xl pl-9 pr-3 py-2 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-10"
                />
              </div>

              {/* Movement Type Filter */}
              <select
                value={movementTypeFilter}
                onChange={(e) => {
                  setMovementTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-surface border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-10 appearance-none cursor-pointer"
              >
                <option value="All">ALL MOVEMENTS</option>
                <option value="purchase_in">PURCHASE IN</option>
                <option value="sale_consumption">SALE CONSUMPTION</option>
                <option value="sale_reversal">SALE REVERSAL</option>
                <option value="wastage">WASTAGE</option>
                <option value="opening_balance">OPENING BALANCE</option>
                <option value="inventory_count_adjustment">COUNT ADJUSTMENT</option>
              </select>

              {/* Item Filter */}
              <select
                value={selectedItemId}
                onChange={(e) => {
                  setSelectedItemId(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-surface border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-10 appearance-none cursor-pointer"
              >
                <option value="All">ALL INGREDIENTS</option>
                {ingredients?.map((ing) => (
                  <option key={ing._id} value={ing._id}>
                    {ing.name.toUpperCase()}
                  </option>
                ))}
              </select>

              {/* Reference Type Filter */}
              <select
                value={refTypeFilter}
                onChange={(e) => {
                  setRefTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-surface border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-10 appearance-none cursor-pointer"
              >
                <option value="All">ALL REFERENCE TYPES</option>
                <option value="order">ORDER SALES</option>
                <option value="wasteLog">WASTE LOGS</option>
                <option value="manual">MANUAL ADJUSTMENTS</option>
              </select>

              {/* User Filter */}
              <select
                value={selectedUser}
                onChange={(e) => {
                  setSelectedUser(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-surface border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-10 appearance-none cursor-pointer"
              >
                <option value="All">ALL OPERATORS</option>
                {filterUsersList.map((usr) => (
                  <option key={usr} value={usr}>
                    @{usr.toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table Contents */}
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-10 bg-black text-white select-none">
                <tr className="uppercase text-[9px] tracking-widest font-black">
                  <th
                    className="px-6 py-4 cursor-pointer hover:bg-neutral-800 transition-colors w-[15%]"
                    onClick={() => handleSort("date")}
                  >
                    <div className="flex items-center">
                      <span>Date & Time</span>
                      {renderSortIndicator("date")}
                    </div>
                  </th>
                  <th className="px-6 py-4 w-[15%]">Type</th>
                  <th
                    className="px-6 py-4 cursor-pointer hover:bg-neutral-800 transition-colors w-[20%]"
                    onClick={() => handleSort("item")}
                  >
                    <div className="flex items-center">
                      <span>Item</span>
                      {renderSortIndicator("item")}
                    </div>
                  </th>
                  <th
                    className="px-6 py-4 cursor-pointer hover:bg-neutral-800 transition-colors w-[10%] text-right"
                    onClick={() => handleSort("qty")}
                  >
                    <div className="flex items-center justify-end">
                      <span>Change</span>
                      {renderSortIndicator("qty")}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right w-[8%]">Previous</th>
                  <th className="px-6 py-4 text-right w-[8%]">New Bal</th>
                  <th className="px-6 py-4 w-[10%]">Reference</th>
                  <th className="px-6 py-4 w-[8%]">User</th>
                  <th className="px-6 py-4 w-[11%]">Notes</th>
                  {currentUser?.role === "admin" && <th className="px-6 py-4 text-right w-[5%]">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-outline-variant/30 text-xs font-bold text-on-surface">
                {paginatedMovements.length === 0 ? (
                  <tr>
                    <td
                      colSpan={currentUser?.role === "admin" ? 10 : 9}
                      className="px-8 py-20 text-center text-on-surface-variant font-bold uppercase tracking-widest opacity-40"
                    >
                      <History className="w-12 h-12 mx-auto mb-3" />
                      No stock movement audit records found.
                    </td>
                  </tr>
                ) : (
                  paginatedMovements.map((mov) => {
                    const isSoftDeleted = mov.notes?.startsWith("[DELETED BY ADMIN");
                    return (
                      <tr
                        key={mov._id}
                        className={cn(
                          "hover:bg-primary/5 transition-all",
                          isSoftDeleted && "opacity-40 line-through bg-neutral-100"
                        )}
                      >
                        <td className="px-6 py-4 font-mono text-[10px] text-on-surface-variant">
                          {format(mov.movementDate, "yyyy-MM-dd HH:mm:ss")}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border",
                              mov.quantity > 0
                                ? "bg-green-500/10 text-green-600 border-green-500/20"
                                : "bg-red-500/10 text-red-600 border-red-500/20"
                            )}
                          >
                            {formatType(mov.movementType)}
                          </span>
                        </td>
                        <td className="px-6 py-4 uppercase font-black text-on-surface">
                          {mov.itemName}
                        </td>
                        <td
                          className={cn(
                            "px-6 py-4 text-right font-display text-sm",
                            mov.quantity > 0 ? "text-green-600" : "text-red-600"
                          )}
                        >
                          {mov.quantity > 0 ? `+${mov.quantity}` : mov.quantity} {mov.unit}
                        </td>
                        <td className="px-6 py-4 text-right text-on-surface-variant/70 font-mono text-[11px]">
                          {mov.previousBalance} {mov.unit}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-[11px]">
                          {mov.newBalance} {mov.unit}
                        </td>
                        <td className="px-6 py-4 uppercase font-mono text-[9px] opacity-75 text-on-surface-variant">
                          {mov.referenceType ? (
                            <span className="flex items-center gap-1">
                              {mov.referenceType}
                              {mov.referenceId && (
                                <span className="text-[8px] bg-surface-container px-1 py-0.5 rounded border">
                                  #{mov.referenceId.slice(-4).toUpperCase()}
                                </span>
                              )}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-6 py-4 lowercase font-black text-on-surface-variant">
                          @{mov.username || "system"}
                        </td>
                        <td className="px-6 py-4 text-[10px] font-medium max-w-[200px] truncate" title={mov.notes}>
                          {mov.notes || "—"}
                        </td>
                        {currentUser?.role === "admin" && (
                          <td className="px-6 py-4 text-right">
                            {mov.referenceType === "manual" && !isSoftDeleted && (
                              <button
                                onClick={() => handleDelete(mov._id)}
                                className="p-1 rounded bg-error/10 hover:bg-error/20 text-red-600 border border-transparent hover:border-red-300 transition-all"
                                title="Soft-delete adjustment"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls footer */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t-2 border-outline flex items-center justify-between bg-surface-container-low/40">
              <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider opacity-60">
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedMovements.length)} of{" "}
                {filteredAndSortedMovements.length} transactions
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 text-[9px] font-black uppercase tracking-widest bg-surface border-2 border-outline rounded-xl hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-hard-sm active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1">
                  {(() => {
                    const pages: (number | string)[] = [];
                    if (totalPages <= 7) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i);
                    } else {
                      if (currentPage <= 4) {
                        pages.push(1, 2, 3, 4, 5, '...', totalPages);
                      } else if (currentPage >= totalPages - 3) {
                        pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
                      } else {
                        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
                      }
                    }

                    return pages.map((page, idx) => {
                      if (page === '...') {
                        return (
                          <div key={`ellipsis-${idx}`} className="w-9 h-9 flex items-center justify-center text-on-surface-variant font-black">
                            ...
                          </div>
                        );
                      }
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page as number)}
                          className={cn(
                            "w-9 h-9 rounded-xl text-[10px] font-black uppercase border-2 transition-all shadow-hard-sm",
                            currentPage === page ? "bg-primary border-primary text-on-primary" : "bg-surface hover:border-primary/50"
                          )}
                        >
                          {page}
                        </button>
                      );
                    });
                  })()}
                </div>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 text-[9px] font-black uppercase tracking-widest bg-surface border-2 border-outline rounded-xl hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-hard-sm active:scale-95"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Log Wastage Modal */}
      <LogWasteModal isOpen={isWasteModalOpen} onClose={() => setIsWasteModalOpen(false)} />
    </PageLayout>
  );
}
