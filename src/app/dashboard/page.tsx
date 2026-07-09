"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { PageLayout } from "@/components/PageLayout";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatCurrency, cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Package,
  Receipt,
  Search,
  Trash2,
  AlertCircle,
  User,
  CreditCard,
  Banknote,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Download,
  Percent,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Coins,
  Scale,
  Wallet,
  Calendar,
  Layers,
  Users,
  CheckCircle,
  Info,
  ShieldAlert,
  XCircle,
  Truck,
} from "lucide-react";
import {
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  endOfWeek,
} from "date-fns";

const COLORS = ["#FF6B35", "#4ECDC4", "#FFD93D", "#6B5B95", "#88D8B0", "#FFCC5C"];

export default function DashboardPage() {
  // Sticky Top Date Ribbon
  const [dateRangeType, setDateRangeType] = useState<"Today" | "Yesterday" | "This Week">("Today");

  const dateRange = React.useMemo(() => {
    const now = new Date();
    if (dateRangeType === "Today") {
      return {
        start: startOfDay(now).getTime(),
        end: endOfDay(now).getTime(),
        label: "Today",
      };
    }
    if (dateRangeType === "Yesterday") {
      const yest = subDays(now, 1);
      return {
        start: startOfDay(yest).getTime(),
        end: endOfDay(yest).getTime(),
        label: "Yesterday",
      };
    }
    if (dateRangeType === "This Week") {
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }).getTime(),
        end: endOfWeek(now, { weekStartsOn: 1 }).getTime(),
        label: "This Week",
      };
    }
    return {
      start: startOfDay(now).getTime(),
      end: endOfDay(now).getTime(),
      label: "Today",
    };
  }, [dateRangeType]);

  const rangeLength = dateRange.end - dateRange.start;
  const startForQuery = dateRange.start - rangeLength;

  // Queries
  const metricsQuery = useQuery(api.analytics.getDashboardMetrics, {
    start: dateRange.start,
    end: dateRange.end,
  });

  const orders = useQuery(api.orders.listByRange, {
    start: dateRange.start,
    end: dateRange.end,
  });
  const ingredients = useQuery(api.ingredients.list);
  const sessions = useQuery(api.caixa.listSessions, { limit: 20 });

  // Search & Filter & Pagination/Sorting State for Section 8 (Recent Sales)
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Paid" | "Pending" | "Credit">("All");
  const [sortField, setSortField] = useState<"refCode" | "client" | "method" | "status" | "total" | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const expandedItems = useQuery(
    api.orders.getOrderItems,
    expandedOrder ? { orderId: expandedOrder as any } : "skip"
  );
  const ROWS_PER_PAGE = 5;

  // Reset pagination when search or filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, sortField, sortOrder, dateRange]);

  const metrics = metricsQuery || {
    grossRevenue: 0,
    orderCount: 0,
    revenueGrowth: 0,
    cashCollected: 0,
    collectedPercentage: 0,
    paymentCount: 0,
    outstandingDebt: 0,
    debtOrderCount: 0,

    completedTransactions: 0,
    aov: 0,
    totalItemsSold: 0,
    avgItemsPerOrder: 0,
    activeCustomersCount: 0,
    profileSalesCount: 0,
    genericSalesCount: 0,

    fullyPaidCount: 0,
    fullyPaidValue: 0,
    pendingCount: 0,
    pendingBalance: 0,
    creditCount: 0,
    creditDebtValue: 0,

    paymentMethodsBreakdown: {} as Record<string, { amount: number; count: number }>,
    topProducts: [] as Array<{ name: string; qty: number; percentage: number }>,
    categoryData: [] as Array<{ name: string; value: number }>,
    deliveryRevenue: 0,
    deliveryOrdersCount: 0,
    pickupOrdersCount: 0,
    avgDeliveryFee: 0,
  };

  // Section 8: Recent Sales sorting, filter and search
  const filteredOrders = React.useMemo(() => {
    if (!orders) return [];

    const filtered = orders.filter((order) => {
      const searchString = searchTerm.toLowerCase();
      const orderCodeMatch = (order.orderCode ?? "").toLowerCase().includes(searchString);
      const orderIdMatch = order._id.toLowerCase().includes(searchString);
      const customerMatch = (order as any).customer?.name.toLowerCase().includes(searchString);
      const itemMatch = order.items.some((item: any) =>
        item.dishName.toLowerCase().includes(searchString)
      );
      const matchesSearch = orderCodeMatch || orderIdMatch || itemMatch || customerMatch;

      let matchesStatus = true;
      if (statusFilter === "Paid") {
        matchesStatus = order.status === "Paid";
      } else if (statusFilter === "Pending") {
        matchesStatus = order.status === "Partially Paid";
      } else if (statusFilter === "Credit") {
        matchesStatus = order.status === "Pending"; // Completely unpaid
      }

      return matchesSearch && matchesStatus;
    });

    if (!sortField) return filtered;

    return [...filtered].sort((a, b) => {
      let aVal = "";
      let bVal = "";

      if (sortField === "refCode") {
        aVal = a.orderCode ?? `#${a._id.slice(-6).toUpperCase()}`;
        bVal = b.orderCode ?? `#${b._id.slice(-6).toUpperCase()}`;
      } else if (sortField === "client") {
        aVal = (a as any).customer?.name || "Generic Client";
        bVal = (b as any).customer?.name || "Generic Client";
      } else if (sortField === "method") {
        if (a.payments && a.payments.length > 0) {
          aVal = a.payments.map((p: any) => p.method).join(" + ");
        } else {
          aVal = a.paymentMethod || "Cash";
        }
        if (b.payments && b.payments.length > 0) {
          bVal = b.payments.map((p: any) => p.method).join(" + ");
        } else {
          bVal = b.paymentMethod || "Cash";
        }
      } else if (sortField === "status") {
        aVal = a.status;
        bVal = b.status;
      } else if (sortField === "total") {
        return sortOrder === "asc" ? a.total - b.total : b.total - a.total;
      }

      const comparison = aVal.localeCompare(bVal);
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [orders, searchTerm, statusFilter, sortField, sortOrder, dateRange]);

  const handleSort = (field: "refCode" | "client" | "method" | "status" | "total") => {
    if (sortField === field) {
      if (sortOrder === "asc") {
        setSortOrder("desc");
      } else {
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (field: "refCode" | "client" | "method" | "status" | "total") => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 hover:opacity-100 transition-opacity flex-shrink-0" />;
    }
    if (sortOrder === "asc") {
      return <ArrowUp className="w-3 h-3 ml-1 text-primary flex-shrink-0" />;
    }
    return <ArrowDown className="w-3 h-3 ml-1 text-primary flex-shrink-0" />;
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case "Cash":
        return <Banknote className="w-4 h-4 text-green-500" />;
      case "POS":
        return <CreditCard className="w-4 h-4 text-primary" />;

      default:
        return <Smartphone className="w-4 h-4 text-blue-500" />;
    }
  };

  // Section 6: Operations & Cash Control
  const activeSession = sessions?.find((s) => s.status === "open");
  const closedSessions = sessions?.filter((s) => s.status === "closed") || [];
  const discrepancySum = closedSessions.reduce((sum, s) => sum + (s.difference || 0), 0);

  // Section 7: Alerts & Attention Required
  const stockAlerts = React.useMemo(() => {
    if (!ingredients) return { lowStock: [], outOfStock: [] };

    const outOfStock = ingredients
      .filter((ing) => ing.stockQuantity <= 0)
      .slice(0, 5);

    const lowStock = ingredients
      .filter((ing) => ing.stockQuantity > 0 && ing.stockQuantity <= ing.lowStockThreshold)
      .sort((a, b) => a.stockQuantity - b.stockQuantity)
      .slice(0, 5);

    return { lowStock, outOfStock };
  }, [ingredients]);

  return (
    <PageLayout isFullWidth={true}>
      <div className="space-y-8 pb-12">

        {/* Header and TOP STICKY FILTER BAR (Section 0) */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b-2 border-outline py-4 px-2 -mx-2 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
          <div>
            <h2 className="text-xl lg:text-xl font-black text-on-surface uppercase tracking-tight">
              Dashboard
            </h2>
            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest opacity-60">
              Enterprise Overview & Operations Overview
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Range Toggle Buttons */}
            <div className="flex bg-surface border-2 border-outline rounded-xl p-1 shadow-hard-sm animate-fadeIn">
              {(["Today", "Yesterday", "This Week"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setDateRangeType(type)}
                  className={cn(
                    "px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all",
                    dateRangeType === type
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:text-primary"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SECTIONS 1 & 4 COMBINED: 2-Column Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* LEFT: Summary */}
          <div className="space-y-3 flex flex-col h-full">
            <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80">Summary</h3>
            <div className="flex flex-col gap-4 flex-1">

              {/* Gross Revenue - Main Card */}
              <div className="bg-surface border-2 border-outline rounded-2xl p-5 shadow-hard relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
                  <Coins className="w-32 h-32" />
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] opacity-80 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    Gross Revenue
                  </span>
                  <span className={cn(
                    "text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded border shadow-hard-sm",
                    metrics.revenueGrowth >= 0
                      ? "bg-green-500/10 text-green-600 border-green-500/20"
                      : "bg-red-500/10 text-red-600 border-red-500/20"
                  )}>
                    {metrics.revenueGrowth >= 0 ? `▲ +${metrics.revenueGrowth.toFixed(1)}%` : `▼ ${metrics.revenueGrowth.toFixed(1)}%`}
                  </span>
                </div>
                <p className="text-3xl font-display text-on-surface tracking-tight leading-none mb-4">
                  {orders === undefined ? "---" : formatCurrency(metrics.grossRevenue)}
                </p>
                <div className="flex items-center justify-between border-t border-outline-variant/30 pt-3 text-[10px] font-black uppercase tracking-wider text-on-surface-variant/70">
                  <span>Orders: <strong className="text-on-surface">{metrics.orderCount}</strong></span>
                  <span>vs Previous Period</span>
                </div>
              </div>

              {/* Sub-cards Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">

                {/* Cash Collected */}
                <div className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Collected
                    </span>
                  </div>
                  <p className="text-xl font-display text-on-surface tracking-tight leading-none mb-3">
                    {orders === undefined ? "---" : formatCurrency(metrics.cashCollected)}
                  </p>
                  <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider">
                    <span className="text-primary bg-primary/10 px-1.5 py-0.5 rounded">{metrics.collectedPercentage.toFixed(1)}% of Rev</span>
                    <span className="text-on-surface-variant">{metrics.paymentCount} pmts</span>
                  </div>
                </div>

                {/* Accounts Receivable */}
                <div className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-error" />
                      Receivable
                    </span>
                  </div>
                  <p className={cn("text-xl font-display tracking-tight leading-none mb-3", metrics.outstandingDebt > 0 ? "text-error" : "text-on-surface")}>
                    {orders === undefined ? "---" : formatCurrency(metrics.outstandingDebt)}
                  </p>
                  <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider">
                    {metrics.debtOrderCount > 0 ? (
                      <span className="text-error bg-error/10 px-1.5 py-0.5 rounded">{metrics.debtOrderCount} Pending</span>
                    ) : (
                      <span className="text-on-surface-variant">0 Pending</span>
                    )}
                  </div>
                </div>

              </div>

              {/* Delivery KPI Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Delivery Revenue */}
                <div className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
                  <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-primary" /> Delivery Rev
                  </span>
                  <p className="text-xl font-display text-primary mt-2">{formatCurrency(metrics.deliveryRevenue)}</p>
                </div>
                {/* Delivery Orders */}
                <div className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
                  <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">
                    Delivery Orders
                  </span>
                  <p className="text-xl font-display text-on-surface mt-2">{metrics.deliveryOrdersCount}</p>
                </div>
                {/* Pickup Orders */}
                <div className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
                  <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">
                    Pickup Orders
                  </span>
                  <p className="text-xl font-display text-on-surface mt-2">{metrics.pickupOrdersCount}</p>
                </div>
                {/* Avg Delivery Fee */}
                <div className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
                  <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">
                    Avg Del Fee
                  </span>
                  <p className="text-xl font-display text-on-surface mt-2">{formatCurrency(metrics.avgDeliveryFee)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Payment Collections */}
          <div className="space-y-3 flex flex-col h-full">
            <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80">Payment Collections</h3>
            <div className="bg-surface border-2 border-outline rounded-2xl shadow-hard p-4 flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Object.entries(metrics.paymentMethodsBreakdown)
                  .filter(([method]) => method.toLowerCase() !== "store credit" && method.toLowerCase() !== "credit")
                  .map(([method, data]: [string, any]) => {
                  const totalAmt = Object.values(metrics.paymentMethodsBreakdown).reduce((sum: number, item: any) => sum + item.amount, 0);
                  const percentage = totalAmt > 0 ? (data.amount / totalAmt) * 100 : 0;
                  return (
                    <div key={method} className="bg-surface-container-low border border-outline/50 rounded-xl p-3 flex items-center gap-3 hover:bg-surface-container-high transition-all duration-200">
                      <div className="w-9 h-9 rounded-lg bg-surface-container-high border border-outline flex items-center justify-center flex-shrink-0">
                        {getMethodIcon(method)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="font-black uppercase text-[9px] tracking-wider text-on-surface-variant truncate">{method}</span>
                          <span className="text-[8px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded">{percentage.toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between items-baseline">
                          <span className="font-display text-sm text-on-surface leading-none">{formatCurrency(data.amount)}</span>
                          <span className="text-[8px] font-bold text-on-surface-variant/60 uppercase ml-1 flex-shrink-0">{data.count} tx</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
        {/* Spacer between sections */}

        {/* SECTION 5: PRODUCT PERFORMANCE (Top Selling on Left, Categories on Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Selling Products */}
          <div className="bg-surface border-2 border-outline rounded-2xl p-6 shadow-hard space-y-4">
            <div>
              <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary" />
                Top Selling Products
              </h3>
              <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-1">
                Top performing dishes in this selected range
              </p>
            </div>

            <div className="space-y-4">
              {metrics.topProducts.length === 0 ? (
                <div className="text-center py-12 text-[10px] text-on-surface-variant/40 font-black uppercase tracking-wider">
                  No sales recorded in this range
                </div>
              ) : (
                metrics.topProducts.map((p, index) => (
                  <div key={index} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-on-surface truncate max-w-[200px] uppercase text-[10px] tracking-wide">
                        {p.name}
                      </span>
                      <span className="font-black text-primary text-[10px]">{p.qty} units ({p.percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="w-full bg-surface-container-high h-3 rounded-full overflow-hidden border border-outline shadow-hard-sm-sm">
                      <div
                        className="bg-primary h-full rounded-full transition-all duration-500"
                        style={{ width: `${p.percentage}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Category Performance */}
          <div className="bg-surface border-2 border-outline rounded-2xl p-6 shadow-hard space-y-4">
            <div>
              <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80 flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                Category Performance
              </h3>
              <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-1">
                Item units sold grouped by menu category
              </p>
            </div>

            <div className="space-y-4">
              {metrics.categoryData.length === 0 ? (
                <div className="text-center py-12 text-[10px] text-on-surface-variant/40 font-black uppercase tracking-wider">
                  No category data available
                </div>
              ) : (
                metrics.categoryData.slice(0, 5).map((cat, index) => {
                  const maxVal = Math.max(...metrics.categoryData.map(c => c.value), 1);
                  const pct = (cat.value / maxVal) * 100;
                  return (
                    <div key={index} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-on-surface uppercase text-[10px] tracking-wide">
                          {cat.name}
                        </span>
                        <span className="font-black text-primary text-[10px]">{cat.value} units</span>
                      </div>
                      <div className="w-full bg-surface-container-high h-3 rounded-full overflow-hidden border border-outline shadow-hard-sm-sm">
                        <div
                          className="bg-secondary h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Spacer between sections */}


        {/* SECTIONS 6 & 7 COMBINED: Operations & Attention (2 Columns) */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* LEFT: Operations & Cash Control */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80">Operations & Cash Control</h3>
            <div className="flex flex-col gap-4">

              {/* Expected Cash Drawer Balance - Main Card */}
              <div className="bg-surface border-2 border-outline rounded-2xl p-5 shadow-hard flex flex-col justify-between">
                <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3 mb-4">
                  <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Drawer expected Cash</span>
                  <div className="p-1 bg-primary/10 rounded text-primary"><Banknote className="w-3.5 h-3.5" /></div>
                </div>
                <div>
                  {activeSession ? (
                    <div className="space-y-1">
                      <p className="text-3xl font-display text-on-surface leading-none">{formatCurrency((activeSession as any).expectedCash || activeSession.openingAmount)}</p>
                      <p className="text-[9px] font-black uppercase text-on-surface-variant/60 tracking-wider pt-2">
                        Opening + Cash Sales + Cash Ins - Cash Outs
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-on-surface-variant/50 uppercase font-black">Open the register to view live expected cash.</p>
                  )}
                </div>
              </div>

              {/* Sub-cards Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Cash Session Status */}
                <div className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Caixa Status</span>
                    <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-black uppercase border shadow-hard-sm",
                      activeSession ? "bg-green-500/10 text-green-500 border-green-500/20 animate-pulse" : "bg-red-500/10 text-red-500 border-red-500/20"
                    )}>
                      {activeSession ? "Open" : "Closed"}
                    </span>
                  </div>
                  <div>
                    {activeSession ? (
                      <div className="text-[9px] font-bold text-on-surface-variant uppercase space-y-1">
                        <p>User: <strong className="text-on-surface lowercase font-black">@{activeSession.username}</strong></p>
                        <p>Time: <strong>{format(activeSession.openedAt, "HH:mm")}</strong></p>
                        <p>Float: <strong>{formatCurrency(activeSession.openingAmount)}</strong></p>
                      </div>
                    ) : (
                      <p className="text-[9px] text-on-surface-variant/50 uppercase font-black">No active session.</p>
                    )}
                  </div>
                </div>

                {/* Discrepancy Log */}
                <div className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col justify-between">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Discrepancies</span>
                    <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-black uppercase border",
                      discrepancySum === 0 ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                    )}>
                      {discrepancySum === 0 ? "Balanced" : discrepancySum > 0 ? `+${discrepancySum.toFixed(2)}` : `${discrepancySum.toFixed(2)}`}
                    </span>
                  </div>
                  <div>
                    {closedSessions.length === 0 ? (
                      <p className="text-[9px] text-on-surface-variant/50 uppercase font-black">No recent data.</p>
                    ) : (
                      <div className="space-y-1 max-h-[60px] overflow-auto text-[8px] font-bold uppercase tracking-wider text-on-surface-variant/80">
                        {closedSessions.slice(0, 3).map((s, idx) => (
                          <div key={idx} className="flex justify-between border-b border-dashed border-outline-variant/30 pb-0.5 last:border-0 last:pb-0">
                            <span>@{s.username}</span>
                            <span className={s.difference === 0 ? "text-green-500" : "text-error font-black"}>
                              {s.difference === 0 ? "Balanced" : s.difference && s.difference > 0 ? `+${s.difference}` : `${s.difference}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* RIGHT: Attention Required */}
          <div className="space-y-3">
            <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80">Attention Required</h3>
            <div className="bg-surface border-2 border-outline rounded-2xl p-5 shadow-hard max-h-[320px] flex flex-col">
              <div className="flex items-center gap-2 border-b border-outline pb-3 mb-4 flex-shrink-0">
                <ShieldAlert className="w-5 h-5 text-error" />
                <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60">
                  Stock items requiring immediate attention
                </p>
              </div>

              <div className="flex-1 overflow-auto">
                {stockAlerts.lowStock.length === 0 && stockAlerts.outOfStock.length === 0 ? (
                  <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-600 font-bold uppercase text-[10px] tracking-wider h-full">
                    <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-500" />
                    All stock levels are healthy. No low or out-of-stock items detected.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-6">
                    {/* Out of Stock */}
                    {stockAlerts.outOfStock.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5" />
                          Out of Stock ({stockAlerts.outOfStock.length})
                        </p>
                        {stockAlerts.outOfStock.map((ing, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-black text-red-700 uppercase tracking-wider truncate">{ing.name}</p>
                              <p className="text-[9px] font-bold text-red-600/70 uppercase tracking-wider mt-0.5">Threshold: {ing.lowStockThreshold} {ing.unit}</p>
                            </div>
                            <span className="font-display text-red-600 text-lg leading-none flex-shrink-0">0 {ing.unit}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Low Stock */}
                    {stockAlerts.lowStock.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Low Stock ({stockAlerts.lowStock.length})
                        </p>
                        {stockAlerts.lowStock.map((ing, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-black text-orange-700 uppercase tracking-wider truncate">{ing.name}</p>
                              <p className="text-[9px] font-bold text-orange-600/70 uppercase tracking-wider mt-0.5">Threshold: {ing.lowStockThreshold} {ing.unit}</p>
                            </div>
                            <span className="font-display text-orange-600 text-lg leading-none flex-shrink-0">{ing.stockQuantity} {ing.unit}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 8: RECENT SALES TABLE (Full width) */}
        <div className="bg-surface border-2 border-outline rounded-2xl shadow-hard overflow-hidden flex flex-col min-h-[450px]">
          <div className="px-6 py-4 border-b border-outline bg-surface-container-low/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none">
            <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em]">
              Recent Sales Log ({filteredOrders.length})
            </h3>

            <div className="flex flex-wrap items-center gap-3">
              {/* Search input */}
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant opacity-40" />
                <input
                  type="text"
                  placeholder="SEARCH ORDER, CLIENT, ITEM..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-surface border-2 border-outline rounded-xl pl-9 pr-3 py-1.5 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-9"
                />
              </div>

              {/* Status filter dropdown */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-surface border-2 border-outline rounded-xl px-3 py-1.5 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-9 cursor-pointer"
              >
                <option value="All">ALL STATUS</option>
                <option value="Paid">FULLY PAID</option>
                <option value="Pending">PENDING (PARTIAL)</option>
                <option value="Credit">CREDIT (UNPAID)</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-10 bg-black text-white select-none">
                <tr className="uppercase text-[9px] tracking-widest font-black">
                  <th
                    className="px-6 py-3 cursor-pointer hover:bg-neutral-800 transition-colors"
                    onClick={() => handleSort("refCode")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Order ID</span>
                      {renderSortIcon("refCode")}
                    </div>
                  </th>
                  <th className="px-6 py-3">Time</th>
                  <th
                    className="px-6 py-3 cursor-pointer hover:bg-neutral-800 transition-colors"
                    onClick={() => handleSort("client")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Customer</span>
                      {renderSortIcon("client")}
                    </div>
                  </th>
                  <th className="px-6 py-3">Items</th>
                  <th
                    className="px-6 py-3 text-right cursor-pointer hover:bg-neutral-800 transition-colors"
                    onClick={() => handleSort("total")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Total</span>
                      {renderSortIcon("total")}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-right">Amount Paid</th>
                  <th
                    className="px-6 py-3 cursor-pointer hover:bg-neutral-800 transition-colors"
                    onClick={() => handleSort("method")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Payment Method</span>
                      {renderSortIcon("method")}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 cursor-pointer hover:bg-neutral-800 transition-colors"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      {renderSortIcon("status")}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 text-xs font-bold text-on-surface">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-8 py-16 text-center text-on-surface-variant font-bold uppercase tracking-widest opacity-40">
                      <Receipt className="w-12 h-12 mx-auto mb-3" />
                      No sales records found.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE).map((order) => (
                    <React.Fragment key={order._id}>
                      <tr
                        className={cn(
                          "hover:bg-primary/5 cursor-pointer transition-all",
                          expandedOrder === order._id && "bg-primary/5"
                        )}
                        onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)}
                      >
                        <td className="px-6 py-3.5 uppercase font-display text-primary">
                          {order.orderCode ?? `#${order._id.slice(-6).toUpperCase()}`}
                        </td>
                        <td className="px-6 py-3.5 text-on-surface-variant">
                          {format(order.createdAt, "HH:mm")}
                        </td>
                        <td className="px-6 py-3.5 uppercase">
                          {(order as any).customer?.name || "Generic Client"}
                        </td>
                        <td className="px-6 py-3.5 max-w-[200px] truncate text-on-surface-variant text-[11px]">
                          {order.items.map((item: any) => `${item.dishName} (x${item.quantity})`).join(", ")}
                        </td>
                        <td className="px-6 py-3.5 text-right font-display text-[14px]">
                          {formatCurrency(order.total)}
                        </td>
                        <td className="px-6 py-3.5 text-right text-green-600 font-black">
                          {formatCurrency(order.amountPaid)}
                        </td>
                        <td className="px-6 py-3.5 uppercase text-[10px] tracking-wider">
                          <div className="flex items-center gap-1.5">
                            {getMethodIcon(order.paymentMethod || "Cash")}
                            <span>
                              {order.payments && order.payments.length > 0
                                ? order.payments.map((p: any) => p.method).join(" + ")
                                : order.paymentMethod || "Cash"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5">
                          <span className={cn(
                            "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                            order.status === "Paid"
                              ? "bg-green-500/10 text-green-600 border-green-500/20"
                              : "bg-red-500/10 text-red-600 border-red-500/20"
                          )}>
                            {order.status === "Paid" ? "Paid" : "Cancelled"}
                          </span>
                        </td>
                      </tr>

                      {/* Expandable Order Detail */}
                      {expandedOrder === order._id && (
                        <tr className="bg-surface-container-low/40">
                          <td colSpan={8} className="px-6 py-4 border-b border-outline-variant/30">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs uppercase tracking-wider font-black">
                              {/* Left Side: Items */}
                              <div className="space-y-2">
                                <p className="text-[10px] font-black text-on-surface-variant/60">Items Detail</p>
                                <div className="space-y-1 text-[11px] font-bold">
                                  {!expandedItems ? (
                                    <div className="flex justify-center p-2 opacity-50">
                                      <div className="w-5 h-5 border border-primary border-t-transparent rounded-full animate-spin" />
                                    </div>
                                  ) : (expandedItems.length > 0 ? expandedItems : (order.items || [])).length === 0 ? (
                                    <p className="text-[10px] text-on-surface-variant opacity-60 px-2">No items found</p>
                                  ) : (
                                    (expandedItems.length > 0 ? expandedItems : (order.items || [])).map((item: any, idx: number) => (
                                      <div key={idx} className="flex justify-between border-b border-outline-variant/20 py-1 bg-surface px-3 py-1.5 border border-outline rounded-xl shadow-hard-sm-sm">
                                        <span>{item.quantity}x {item.dishName}</span>
                                        <span className="text-primary font-black">{formatCurrency((item.priceAtTime ?? item.price ?? 0) * item.quantity)}</span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>

                              {/* Right Side: Totals and metadata */}
                              <div className="bg-surface border border-outline rounded-xl p-4 shadow-hard-sm space-y-2 text-[11px] font-bold text-on-surface-variant">
                                <div className="flex justify-between border-b border-outline-variant/25 pb-1.5 text-on-surface font-black">
                                  <span>Total Bill:</span>
                                  <span>{formatCurrency(order.total)}</span>
                                </div>
                                <div className="flex justify-between text-green-600 font-black">
                                  <span>Amount Paid:</span>
                                  <span>{formatCurrency(order.amountPaid)}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredOrders.length > ROWS_PER_PAGE && (
            <div className="px-6 py-3 border-t border-outline bg-surface-container-low/50 flex items-center justify-between select-none">
              <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider opacity-60">
                Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, filteredOrders.length)} of {filteredOrders.length} records
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest bg-surface border border-outline rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-container-high transition-all"
                >
                  Prev
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredOrders.length / ROWS_PER_PAGE), p + 1))}
                  disabled={currentPage === Math.ceil(filteredOrders.length / ROWS_PER_PAGE)}
                  className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest bg-surface border border-outline rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-container-high transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </PageLayout>
  );
}
