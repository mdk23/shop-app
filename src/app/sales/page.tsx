"use client";

import React, { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatCurrency } from "@/lib/utils";
import { format, startOfDay, endOfDay, subDays } from "date-fns";
import ManagePaymentsModal from "@/components/pos/ManagePaymentsModal";
import { Download } from "lucide-react";
import { toast } from "sonner";

// New modular components
import { SalesMetrics } from "@/components/sales/SalesMetrics";
import { SalesFilterBar } from "@/components/sales/SalesFilterBar";
import { SalesTrendChart } from "@/components/sales/SalesTrendChart";
import { CategorySalesChart } from "@/components/sales/CategorySalesChart";
import { PaymentSplitChart } from "@/components/sales/PaymentSplitChart";
import { TopDishesList } from "@/components/sales/TopDishesList";
import { PeakHoursList } from "@/components/sales/PeakHoursList";
import { SalesTable } from "@/components/sales/SalesTable";
import { CancelOrderModal } from "@/components/sales/CancelOrderModal";

import { useBranch } from "@/contexts/BranchContext";

export default function SalesPage() {
  const { selectedBranchId } = useBranch();
  const [dateRange, setDateRange] = useState({
    start: startOfDay(new Date()).getTime(),
    end: endOfDay(new Date()).getTime(),
    label: "Today",
  });

  // Queries
  const orders = useQuery(api.orders.listByRange, {
    start: dateRange.start,
    end: dateRange.end,
    branchId: selectedBranchId,
  });
  const dishes = useQuery(api.dishes.list);

  // Mutations
  const removeOrder = useMutation(api.orders.remove);

  // Search & Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Completed" | "Pending" | "Cancelled">("All");
  const [methodFilter, setMethodFilter] = useState<string>("All");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<"All" | "Pickup" | "Delivery">("All");
  const [sellerFilter, setSellerFilter] = useState<string>("All");
  const [orderToDelete, setOrderToDelete] = useState<any>(null);
  const [orderToManagePayments, setOrderToManagePayments] = useState<any>(null);

  // Sorting State
  const [sortField, setSortField] = useState<"refCode" | "client" | "method" | "status" | "delivery" | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Pagination
  const ROWS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  // Interactive Chart Mode
  const [chartMode, setChartMode] = useState<"revenue" | "orders" | "aov">("revenue");

  // Dynamic list of sellers in the active orders
  const uniqueSellers = React.useMemo(() => {
    if (!orders) return [];
    const sellersSet = new Set<string>();
    orders.forEach((o) => {
      if (o.username) {
        sellersSet.add(o.username);
      }
    });
    return Array.from(sellersSet).sort();
  }, [orders]);

  // Reset to page 1 whenever filters or sorting change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, methodFilter, fulfillmentFilter, sellerFilter, dateRange, sortField, sortOrder]);

  const handleSort = (field: "refCode" | "client" | "method" | "status" | "delivery") => {
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

  // Map dishes to categories for category analytics
  const dishCategoryMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    if (dishes) {
      dishes.forEach((d) => {
        map[d._id] = d.category || "Chicken";
      });
    }
    return map;
  }, [dishes]);

  // Filters calculation
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
      if (statusFilter === "Completed") {
        matchesStatus = order.status === "Paid";
      } else if (statusFilter === "Pending") {
        matchesStatus = order.status === "Pending" || order.status === "Partially Paid";
      } else if (statusFilter === "Cancelled") {
        matchesStatus = order.status === "Cancelled";
      }

      let matchesMethod = true;
      if (methodFilter !== "All") {
        const primaryMatch = order.paymentMethod === methodFilter;
        const splitMatch = order.payments?.some((p: any) => p.method === methodFilter);
        matchesMethod = primaryMatch || splitMatch;
      }

      let matchesFulfillment = true;
      if (fulfillmentFilter === "Pickup") {
        matchesFulfillment = order.orderType === "pickup" || !order.orderType;
      } else if (fulfillmentFilter === "Delivery") {
        matchesFulfillment = order.orderType === "delivery";
      }

      let matchesSeller = true;
      if (sellerFilter !== "All") {
        matchesSeller = order.username === sellerFilter;
      }

      return matchesSearch && matchesStatus && matchesMethod && matchesFulfillment && matchesSeller;
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
      } else if (sortField === "delivery") {
        aVal = a.orderType === "delivery" ? "delivery" : "pickup";
        bVal = b.orderType === "delivery" ? "delivery" : "pickup";
      }

      const comparison = aVal.localeCompare(bVal);
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [orders, searchTerm, statusFilter, methodFilter, fulfillmentFilter, sellerFilter, sortField, sortOrder]);

  // Aggregate stats based on active orders
  const metrics = React.useMemo(() => {
    if (!orders) {
      return {
        totalSales: 0,
        totalCollected: 0,
        count: 0,
        paymentData: [],
        topDishes: [],
        categorySales: [],
        peakHours: [],
        deliveryRevenue: 0,
        deliveryOrdersCount: 0,
        pickupOrdersCount: 0,
        averageDeliveryFee: 0,
        deliveryRevenuePercentage: 0,
      };
    }

    const activeOrders = orders.filter((o) => o.status !== "Cancelled");

    const totalSales = activeOrders.reduce((acc, o) => acc + o.total, 0);
    const totalCollected = activeOrders.reduce((acc, o) => {
      const payments = (o as any).payments || [];
      if (payments.length > 0) {
        return acc + payments.reduce((sum: number, p: any) => sum + p.amount, 0);
      }
      return acc + o.amountPaid;
    }, 0);

    // Payment methods map
    const paymentMap: Record<string, number> = {};
    // Stock mapping
    const dishMap: Record<string, number> = {};
    // Category mapping
    const categoryMap: Record<string, number> = {};
    // Peak hours mapping
    const hourSlots = {
      "Breakfast (08-12h)": 0,
      "Lunch (12-15h)": 0,
      "Afternoon (15-18h)": 0,
      "Dinner (18-22h)": 0,
      "Night (22-08h)": 0,
    };

    activeOrders.forEach((o) => {
      // Payments split
      const payments = (o as any).payments || [];
      if (payments.length > 0) {
        payments.forEach((p: any) => {
          const method = p.method || "Cash";
          paymentMap[method] = (paymentMap[method] || 0) + p.amount;
        });
      } else {
        const method = o.paymentMethod || "Cash";
        paymentMap[method] = (paymentMap[method] || 0) + o.amountPaid;
      }

      // Dish count
      o.items.forEach((item: any) => {
        dishMap[item.dishName] = (dishMap[item.dishName] || 0) + item.quantity;

        // Categories sold mapping
        const cat = dishCategoryMap[item.dishId] || "Chicken";
        categoryMap[cat] = (categoryMap[cat] || 0) + item.quantity;
      });

      // Hour grouping
      const hour = new Date(o.createdAt).getHours();
      if (hour >= 8 && hour < 12) hourSlots["Breakfast (08-12h)"] += 1;
      else if (hour >= 12 && hour < 15) hourSlots["Lunch (12-15h)"] += 1;
      else if (hour >= 15 && hour < 18) hourSlots["Afternoon (15-18h)"] += 1;
      else if (hour >= 18 && hour < 22) hourSlots["Dinner (18-22h)"] += 1;
      else hourSlots["Night (22-08h)"] += 1;
    });

    const paymentData = Object.entries(paymentMap).map(([name, value]) => ({ name, value }));

    const topDishes = Object.entries(dishMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const categorySales = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

    const peakHours = Object.entries(hourSlots).map(([name, count]) => ({
      name,
      count,
    }));

    const deliveryOrders = activeOrders.filter((o) => o.orderType === "delivery");
    const deliveryRevenue = deliveryOrders.reduce((acc, o) => acc + (o.deliveryFeeAmount ?? 0), 0);
    const deliveryOrdersCount = deliveryOrders.length;
    const pickupOrdersCount = activeOrders.filter((o) => o.orderType === "pickup" || !o.orderType).length;
    const averageDeliveryFee = deliveryOrdersCount > 0 ? deliveryRevenue / deliveryOrdersCount : 0;
    const deliveryRevenuePercentage = totalSales > 0 ? (deliveryRevenue / totalSales) * 100 : 0;

    return {
      totalSales,
      totalCollected,
      count: activeOrders.length,
      paymentData,
      topDishes,
      categorySales,
      peakHours,
      deliveryRevenue,
      deliveryOrdersCount,
      pickupOrdersCount,
      averageDeliveryFee,
      deliveryRevenuePercentage,
    };
  }, [orders, dishCategoryMap]);

  // Aggregation of trend chart data dynamically based on date range
  const trendData = React.useMemo(() => {
    if (!orders) return [];

    const activeOrders = orders.filter((o) => o.status !== "Cancelled");
    const isSingleDay = dateRange.end - dateRange.start <= 86400000;
    const groups: Record<string, { revenue: number; count: number }> = {};

    activeOrders.forEach((o) => {
      const date = new Date(o.createdAt);
      const key = isSingleDay ? format(date, "HH:00") : format(date, "MMM dd");
      if (!groups[key]) {
        groups[key] = { revenue: 0, count: 0 };
      }
      groups[key].revenue += o.total;
      groups[key].count += 1;
    });

    const list = Object.entries(groups).map(([label, val]) => ({
      label,
      Revenue: val.revenue,
      Orders: val.count,
      AOV: val.count > 0 ? Math.round(val.revenue / val.count) : 0,
    }));

    // Sort appropriately
    if (isSingleDay) {
      return list.sort((a, b) => a.label.localeCompare(b.label));
    }
    return list.reverse();
  }, [orders, dateRange]);

  const hasFiltersActive =
    searchTerm !== "" ||
    statusFilter !== "All" ||
    methodFilter !== "All" ||
    fulfillmentFilter !== "All" ||
    sellerFilter !== "All" ||
    dateRange.label !== "Today" ||
    sortField !== null;

  const handleResetFilters = () => {
    setSearchTerm("");
    setStatusFilter("All");
    setMethodFilter("All");
    setFulfillmentFilter("All");
    setSellerFilter("All");
    setSortField(null);
    setSortOrder("asc");
    setDateRange({
      start: startOfDay(new Date()).getTime(),
      end: endOfDay(new Date()).getTime(),
      label: "Today",
    });
  };

  const exportToCSV = () => {
    if (!filteredOrders || filteredOrders.length === 0) return;

    const headers = [
      "Order Code",
      "Date",
      "Time",
      "Customer",
      "Items",
      "Payment Method(s)",
      "Payment Breakdown",
      "Status",
      "Gross Total",
      "Amount Paid",
    ];

    const rows = filteredOrders.map((o) => {
      const orderCode = o.orderCode ?? `#${o._id.slice(-6)}`;
      const dateStr = format(o.createdAt, "yyyy-MM-dd");
      const timeStr = format(o.createdAt, "HH:mm");
      const customerName = (o as any).customer?.name || "Generic Client";

      const itemsList = o.items.map((item: any) => `${item.dishName} (x${item.quantity})`).join(", ");

      const methods =
        o.payments && o.payments.length > 0
          ? o.payments.map((p: any) => p.method).join(" + ")
          : o.paymentMethod || "Cash";

      const breakdown =
        o.payments && o.payments.length > 0
          ? o.payments.map((p: any) => `${p.method}: $${p.amount.toFixed(2)}`).join(" | ")
          : `Paid: $${o.amountPaid.toFixed(2)}`;

      return [
        orderCode,
        dateStr,
        timeStr,
        customerName,
        itemsList,
        methods,
        breakdown,
        o.status,
        o.total.toFixed(2),
        o.amountPaid.toFixed(2),
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((val) => {
            const str = String(val ?? "");
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `sales_export_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <PageLayout isFullWidth={true}>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-on-surface uppercase tracking-tight">
              Sales Dashboard
            </h1>
            <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest opacity-60">
              Complete Sales Analytics & Workspace
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportToCSV}
              disabled={!filteredOrders || filteredOrders.length === 0}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-primary text-on-primary border-2 border-outline rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-secondary active:scale-95 transition-all disabled:opacity-50 shadow-hard"
            >
              <Download className="w-4 h-4" />
              Export Reports
            </button>
          </div>
        </div>

        {/* Top KPI & Delivery Metrics */}
        <SalesMetrics metrics={metrics} />

        {/* Sticky Filters Ribbon */}
        <SalesFilterBar
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          methodFilter={methodFilter}
          setMethodFilter={setMethodFilter}
          fulfillmentFilter={fulfillmentFilter}
          setFulfillmentFilter={setFulfillmentFilter}
          sellerFilter={sellerFilter}
          setSellerFilter={setSellerFilter}
          uniqueSellers={uniqueSellers}
          dateRange={dateRange}
          setDateRange={setDateRange}
          onReset={handleResetFilters}
          hasFiltersActive={hasFiltersActive}
        />

        {/* Main Section Grid: LEFT (70%), RIGHT (30%) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-stretch">
          {/* LEFT COLUMN: Charts (70% width on large screens) */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <SalesTrendChart
              trendData={trendData}
              chartMode={chartMode}
              setChartMode={setChartMode}
            />

            <CategorySalesChart categorySales={metrics.categorySales} />
          </div>

          {/* RIGHT COLUMN: Sidebar (30% width on large screens) */}
          <div className="lg:col-span-1 space-y-6">
            <PaymentSplitChart paymentData={metrics.paymentData} />

            <TopDishesList topDishes={metrics.topDishes} />

            <PeakHoursList peakHours={metrics.peakHours} />
          </div>
        </div>

        {/* BOTTOM SECTION: Full Sales Table */}
        <SalesTable
          filteredOrders={filteredOrders}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          ROWS_PER_PAGE={ROWS_PER_PAGE}
          sortField={sortField}
          sortOrder={sortOrder}
          handleSort={handleSort}
          onDeleteOrder={setOrderToDelete}
          onManagePayments={setOrderToManagePayments}
        />
      </div>

      {/* Manage Payments Modal */}
      {orderToManagePayments && (
        <ManagePaymentsModal
          order={orderToManagePayments}
          onClose={() => setOrderToManagePayments(null)}
        />
      )}

      {/* Cancel Order Modal */}
      {orderToDelete && (
        <CancelOrderModal
          orderToDelete={orderToDelete}
          onClose={() => setOrderToDelete(null)}
          onConfirm={async () => {
            await removeOrder({ id: orderToDelete._id });
            toast.success("Transaction cancelled and inventory restored!");
            setOrderToDelete(null);
          }}
        />
      )}
    </PageLayout>
  );
}
