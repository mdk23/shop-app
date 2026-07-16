"use client";

import React, { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Banknote,
  Smartphone,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  startOfDay,
  endOfDay,
  subDays,
  startOfWeek,
  endOfWeek,
} from "date-fns";

// Extracted Sub-components
import { DateRangeRibbon } from "@/components/dashboard/DateRangeRibbon";
import { MetricCardGrid } from "@/components/dashboard/MetricCardGrid";
import { PaymentCollectionsWidget } from "@/components/dashboard/PaymentCollectionsWidget";
import { ProductSalesPerformance } from "@/components/dashboard/ProductSalesPerformance";
import { CashControlWidget } from "@/components/dashboard/CashControlWidget";
import { LowStockWidget } from "@/components/dashboard/LowStockWidget";
import { RecentActivityTable } from "@/components/dashboard/RecentActivityTable";

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

  // Search & Filter & Pagination/Sorting State for Recent Sales
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

  // Recent Sales sorting, filter and search
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

  // Operations & Cash Control
  const activeSession = sessions?.find((s) => s.status === "open");
  const closedSessions = sessions?.filter((s) => s.status === "closed") || [];
  const discrepancySum = closedSessions.reduce((sum, s) => sum + (s.difference || 0), 0);

  // Alerts & Attention Required
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
        {/* Sticky Filter Bar (Section 0) */}
        <DateRangeRibbon dateRangeType={dateRangeType} setDateRangeType={setDateRangeType} />

        {/* 2-Column Summary Metrics */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <MetricCardGrid orders={orders} metrics={metrics} />
          <PaymentCollectionsWidget metrics={metrics} getMethodIcon={getMethodIcon} />
        </div>

        {/* Product Sales Performance */}
        <ProductSalesPerformance metrics={metrics} />

        {/* Operations & Stock Alerts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <CashControlWidget
            activeSession={activeSession}
            closedSessions={closedSessions}
            discrepancySum={discrepancySum}
          />
          <LowStockWidget stockAlerts={stockAlerts} />
        </div>

        {/* Recent Sales Table */}
        <RecentActivityTable
          filteredOrders={filteredOrders}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          handleSort={handleSort}
          renderSortIcon={renderSortIcon}
          getMethodIcon={getMethodIcon}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          expandedOrder={expandedOrder}
          setExpandedOrder={setExpandedOrder}
          expandedItems={expandedItems}
          ROWS_PER_PAGE={ROWS_PER_PAGE}
        />
      </div>
    </PageLayout>
  );
}
