"use client";

import React, { useState, useEffect } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatCurrency, cn } from "@/lib/utils";
import { format } from "date-fns";
import ManagePaymentsModal from "@/components/pos/ManagePaymentsModal";
import {
  Receipt,
  Search,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  CreditCard,
  Banknote,
  Smartphone,
  Bitcoin,
  ChevronDown,
  ChevronUp,
  Download,
  TrendingUp,
  Activity,
  Package,
  ArrowUpRight,
  TrendingDown,
  Percent,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import {
  startOfDay,
  endOfDay,
  subDays,
} from "date-fns";

const COLORS = ["#FF6B35", "#4ECDC4", "#FFD93D", "#6B5B95", "#88D8B0", "#FFCC5C"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  pos_seller: "POS Seller",
};

export default function SalesPage() {
  const [dateRange, setDateRange] = useState({
    start: startOfDay(new Date()).getTime(),
    end: endOfDay(new Date()).getTime(),
    label: "Today",
  });

  // Queries
  const orders = useQuery(api.orders.listByRange, {
    start: dateRange.start,
    end: dateRange.end,
  });
  const dishes = useQuery(api.dishes.list);

  // Mutations
  const removeOrder = useMutation(api.orders.remove);

  // Search & Filters State
  // Search & Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Completed" | "Pending" | "Cancelled">("All");
  const [methodFilter, setMethodFilter] = useState<string>("All");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<"All" | "Pickup" | "Delivery">("All");
  const [sellerFilter, setSellerFilter] = useState<string>("All");
  const [orderToDelete, setOrderToDelete] = useState<any>(null);
  const [orderToManagePayments, setOrderToManagePayments] = useState<any>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);

  const expandedItems = useQuery(
    api.orders.getOrderItems,
    expandedOrder ? { orderId: expandedOrder as any } : "skip"
  );

  // Sorting State
  const [sortField, setSortField] = useState<"refCode" | "client" | "method" | "status" | "delivery" | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Pagination
  const ROWS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);

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

  const renderSortIcon = (field: "refCode" | "client" | "method" | "status" | "delivery") => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 hover:opacity-100 transition-opacity flex-shrink-0" />;
    }
    if (sortOrder === "asc") {
      return <ArrowUp className="w-3 h-3 ml-1 text-primary flex-shrink-0" />;
    }
    return <ArrowDown className="w-3 h-3 ml-1 text-primary flex-shrink-0" />;
  };

  // Interactive Chart Mode
  const [chartMode, setChartMode] = useState<"revenue" | "orders" | "aov">("revenue");

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
        totalDebt: 0,
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
    const totalDebt = activeOrders.reduce((acc, o) => acc + o.remainingAmount, 0);

    // Payment methods map
    const paymentMap: Record<string, number> = {};
    // Stock mapping
    const dishMap: Record<string, number> = {};
    // Category mapping
    const categoryMap: Record<string, number> = {};
    // Peak hours mapping (Morning, Lunch, Afternoon, Dinner, Night)
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
      totalDebt,
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

  const getMethodIcon = (method: string) => {
    switch (method) {
      case "Cash":
        return <Banknote className="w-4 h-4 text-green-500" />;
      case "POS":
        return <CreditCard className="w-4 h-4 text-primary" />;
      case "Bitcoin":
        return <Bitcoin className="w-4 h-4 text-yellow-500" />;
      default:
        return <Smartphone className="w-4 h-4 text-blue-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "Partially Paid":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      case "Pending":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-surface-container-highest text-on-surface-variant border-outline";
    }
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
      "Remaining Debt",
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
        o.remainingAmount.toFixed(2),
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

        {/* Top KPI Cards (4 columns grid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Gross Sales (with Order count at bottom) */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
          >
            <div>
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2 opacity-80 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Gross Sales
              </p>
              <p className="text-3xl font-display text-on-surface leading-none tracking-tight">
                {formatCurrency(metrics.totalSales)}
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-on-surface bg-surface-container-highest w-fit px-3 py-1.5 rounded-xl border border-outline shadow-hard-sm">
              {metrics.count} Total Orders
            </div>
          </motion.div>

          {/* Net Revenue */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-primary border-2 border-outline p-6 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all text-on-primary"
          >
            <div>
              <p className="text-[10px] font-black text-on-primary/80 uppercase tracking-[0.2em] mb-2">
                Net Revenue
              </p>
              <p className="text-3xl font-display leading-none tracking-tight">
                {formatCurrency(metrics.totalCollected)}
              </p>
            </div>
            <p className="text-[9px] font-bold text-on-primary/70 mt-5 uppercase tracking-wider flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" /> ▲ 12% vs previous period
            </p>
          </motion.div>

          {/* Pending Debt */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
          >
            <div>
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2 opacity-80">
                Pending Debt
              </p>
              <p className={cn("text-3xl font-display leading-none tracking-tight", metrics.totalDebt > 0 ? "text-error" : "text-on-surface")}>
                {formatCurrency(metrics.totalDebt)}
              </p>
            </div>
            <p className="text-[9px] font-bold text-on-surface-variant/60 mt-5 uppercase tracking-wider flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 text-error" /> Outstanding Customer Balances
            </p>
          </motion.div>

          {/* Average Order Value */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
          >
            <div>
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2 opacity-80">
                Avg Order Value
              </p>
              <p className="text-3xl font-display text-on-surface leading-none tracking-tight">
                {formatCurrency(metrics.count > 0 ? Math.round(metrics.totalSales / metrics.count) : 0)}
              </p>
            </div>
            <p className="text-[9px] font-bold text-on-surface-variant/60 mt-5 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-500" /> ▲ 8% vs previous period
            </p>
          </motion.div>
        </div>

        {/* Delivery Analytics KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
          <div className="bg-surface border-2 border-outline p-5 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
            <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest opacity-80">Total Delivery Revenue</span>
            <p className="text-xl font-display text-primary mt-1">{formatCurrency(metrics.deliveryRevenue)}</p>
          </div>
          <div className="bg-surface border-2 border-outline p-5 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
            <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest opacity-80">Delivery Orders</span>
            <p className="text-xl font-display text-on-surface mt-1">{metrics.deliveryOrdersCount}</p>
          </div>
          <div className="bg-surface border-2 border-outline p-5 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
            <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest opacity-80">Pickup Orders</span>
            <p className="text-xl font-display text-on-surface mt-1">{metrics.pickupOrdersCount}</p>
          </div>
          <div className="bg-surface border-2 border-outline p-5 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
            <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest opacity-80">Avg Delivery Fee</span>
            <p className="text-xl font-display text-on-surface mt-1">{formatCurrency(metrics.averageDeliveryFee)}</p>
          </div>
          <div className="bg-surface border-2 border-outline p-5 rounded-2xl shadow-hard flex flex-col justify-between col-span-2 lg:col-span-1 hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
            <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest opacity-80">Delivery Rev %</span>
            <p className="text-xl font-display text-primary mt-1">{metrics.deliveryRevenuePercentage.toFixed(1)}%</p>
          </div>
        </div>

        {/* Sticky Filters Ribbon */}
        <div className="sticky top-16 lg:top-24 z-20 bg-background/95 backdrop-blur-md border-b-2 border-outline py-4 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Status tabs */}
            <div className="flex flex-wrap gap-2">
              {(["All", "Completed", "Pending", "Cancelled"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl border-2 transition-all shadow-hard-sm active:scale-95",
                    statusFilter === status
                      ? "bg-primary text-on-primary border-outline -translate-x-[1px] -translate-y-[1px]"
                      : "bg-surface text-on-surface border-outline-variant hover:text-primary"
                  )}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Custom Range Picker & Reset */}
            <div className="flex flex-wrap items-end gap-3">
              {/* Search */}
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant opacity-40" />
                <input
                  type="text"
                  placeholder="SEARCH CODE, DISH, CLIENT..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-surface border-2 border-outline rounded-xl pl-9 pr-3 py-2 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-10"
                />
              </div>

              {/* Payment Method */}
              <div className="w-full sm:w-40">
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  className="w-full bg-surface border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-10 appearance-none cursor-pointer"
                >
                  <option value="All">ALL PAYMENT METHODS</option>
                  <option value="Cash">CASH</option>
                  <option value="POS">POS CARD</option>
                  <option value="M-Pesa">M-PESA</option>
                  <option value="eMola">EMOLA</option>
                  <option value="BIM">BIM</option>
                  <option value="Moza">MOZA</option>
                  <option value="Bitcoin">BITCOIN</option>
                </select>
              </div>

              {/* Fulfillment Filter */}
              <div className="w-full sm:w-40">
                <select
                  value={fulfillmentFilter}
                  onChange={(e) => setFulfillmentFilter(e.target.value as any)}
                  className="w-full bg-surface border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-10 appearance-none cursor-pointer"
                >
                  <option value="All">ALL FULFILLMENT</option>
                  <option value="Pickup">PICKUP</option>
                  <option value="Delivery">DELIVERY</option>
                </select>
              </div>

              {/* Seller Filter */}
              <div className="w-full sm:w-40">
                <select
                  value={sellerFilter}
                  onChange={(e) => setSellerFilter(e.target.value)}
                  className="w-full bg-surface border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-10 appearance-none cursor-pointer"
                >
                  <option value="All">ALL SELLERS</option>
                  {uniqueSellers.map((seller) => (
                    <option key={seller} value={seller}>
                      @{seller.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={format(dateRange.start, "yyyy-MM-dd")}
                  onChange={(e) => {
                    if (e.target.value) {
                      setDateRange((prev) => ({
                        ...prev,
                        start: startOfDay(new Date(e.target.value)).getTime(),
                        label: "Custom",
                      }));
                    }
                  }}
                  className="bg-surface border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary transition-all font-black text-[9px] h-10"
                />
                <span className="text-[10px] font-black opacity-45 uppercase">TO</span>
                <input
                  type="date"
                  value={format(dateRange.end, "yyyy-MM-dd")}
                  onChange={(e) => {
                    if (e.target.value) {
                      setDateRange((prev) => ({
                        ...prev,
                        end: endOfDay(new Date(e.target.value)).getTime(),
                        label: "Custom",
                      }));
                    }
                  }}
                  className="bg-surface border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary transition-all font-black text-[9px] h-10"
                />
              </div>

              {/* Reset filter */}
              {(searchTerm || statusFilter !== "All" || methodFilter !== "All" || fulfillmentFilter !== "All" || sellerFilter !== "All" || dateRange.label !== "Today" || sortField !== null) && (
                <button
                  onClick={() => {
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
                  }}
                  className="h-10 px-4 bg-error text-on-error border-2 border-outline rounded-xl hover:bg-secondary active:scale-95 transition-all text-[9px] font-black uppercase tracking-widest shadow-hard-sm"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Section Grid: LEFT (70%), RIGHT (30%) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-stretch">
          {/* LEFT COLUMN: Charts (70% width on large screens) */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Sales Trend Chart */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-md font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Sales Trend Analysis
                  </h3>
                  <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-0.5">
                    Real-time transaction volume & collections
                  </p>
                </div>
                {/* Chart Toggle Buttons */}
                <div className="flex items-center bg-surface border border-outline-variant/60 rounded-xl p-1 gap-1">
                  {(["revenue", "orders", "aov"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setChartMode(mode)}
                      className={cn(
                        "px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                        chartMode === mode
                          ? "bg-primary text-on-primary"
                          : "text-on-surface-variant hover:text-primary"
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {trendData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center border border-dashed border-outline rounded-2xl bg-surface-container-high/20 text-on-surface-variant/40 font-black uppercase text-[10px] tracking-wider">
                  No data to plot in this range
                </div>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartMode === "revenue" ? (
                      <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-outline-variant)" opacity={0.3} />
                        <XAxis dataKey="label" stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                        <YAxis stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "var(--color-surface-container-highest)", border: "2px solid var(--color-outline)", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                          formatter={(value: any) => [formatCurrency(value), "Gross Sales"]}
                        />
                        <Area type="monotone" dataKey="Revenue" stroke="var(--color-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                      </AreaChart>
                    ) : chartMode === "orders" ? (
                      <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-outline-variant)" opacity={0.3} />
                        <XAxis dataKey="label" stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                        <YAxis stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "var(--color-surface-container-highest)", border: "2px solid var(--color-outline)", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                          formatter={(value: any) => [value, "Orders Count"]}
                        />
                        <Bar dataKey="Orders" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    ) : (
                      <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-outline-variant)" opacity={0.3} />
                        <XAxis dataKey="label" stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                        <YAxis stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "var(--color-surface-container-highest)", border: "2px solid var(--color-outline)", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                          formatter={(value: any) => [formatCurrency(value), "Avg Order Value"]}
                        />
                        <Line type="monotone" dataKey="AOV" stroke="var(--color-primary)" strokeWidth={3} dot={{ stroke: "var(--color-primary)", strokeWidth: 2, r: 4 }} />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Sales by Category Chart */}
            <div className="flex-1 flex flex-col bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft space-y-4">
              <div>
                <h3 className="text-md font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  Dishes Sold by Category
                </h3>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-0.5">
                  Itemized quantities grouped by menu category (Chicken, Combos, Pizza, Sides, etc.)
                </p>
              </div>

              {metrics.categorySales.length === 0 ? (
                <div className="flex-1 min-h-[300px] flex items-center justify-center border border-dashed border-outline rounded-2xl bg-surface-container-high/20 text-on-surface-variant/40 font-black uppercase text-[10px] tracking-wider">
                  No sales category metrics available
                </div>
              ) : (
                <div className="flex-1 relative min-h-[300px] w-full">
                  <div className="absolute inset-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metrics.categorySales} layout="vertical" margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          width={90}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: "currentColor", fontSize: 9, fontWeight: 900 }}
                        />
                        <Tooltip
                          cursor={{ fill: "var(--color-surface-container-highest)", opacity: 0.4 }}
                          contentStyle={{ backgroundColor: "var(--color-surface-container-highest)", border: "2px solid var(--color-outline)", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                        />
                        <Bar dataKey="value" fill="var(--color-primary)" radius={[0, 8, 8, 0]} name="Units Sold" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Sidebar (30% width on large screens) */}
          <div className="lg:col-span-1 space-y-6">
            {/* Payment Method Split Pie/Donut */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft space-y-4">
              <div>
                <h3 className="text-md font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  Payment Methods Split
                </h3>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-0.5">
                  Share of collection channel
                </p>
              </div>

              {metrics.paymentData.length === 0 ? (
                <div className="h-[180px] flex items-center justify-center text-on-surface-variant/35 text-[10px] font-black uppercase tracking-wider">
                  No payment data
                </div>
              ) : (
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={metrics.paymentData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {metrics.paymentData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "var(--color-surface-container-highest)", border: "2px solid var(--color-outline)", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                        formatter={(value: any) => [formatCurrency(value), "Collected"]}
                      />
                      <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: "9px", fontWeight: "bold" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Top Selling Dishes progress bar list */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft space-y-4">
              <div>
                <h3 className="text-md font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-primary" />
                  Top Selling Dishes
                </h3>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-0.5">
                  Top performing menu items
                </p>
              </div>

              <div className="space-y-3">
                {metrics.topDishes.length === 0 ? (
                  <div className="text-center py-6 text-[10px] text-on-surface-variant/40 font-black uppercase tracking-wider">
                    No dish data recorded
                  </div>
                ) : (
                  metrics.topDishes.map((dish, index) => {
                    const maxCount = Math.max(...metrics.topDishes.map((d) => d.value), 1);
                    const percentage = Math.round((dish.value / maxCount) * 100);
                    return (
                      <div key={index} className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-on-surface truncate max-w-[170px] uppercase text-[10px] tracking-wide">
                            {dish.name}
                          </span>
                          <span className="font-black text-primary text-[10px]">{dish.value} units</span>
                        </div>
                        <div className="w-full bg-surface-container-high h-2.5 rounded-full overflow-hidden border border-outline-variant/30">
                          <div
                            className="bg-primary h-full rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Peak Hours card */}
            <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft space-y-4">
              <div>
                <h3 className="text-md font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Peak Service Hours
                </h3>
                <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-0.5">
                  Busiest periods by order count
                </p>
              </div>

              <div className="space-y-2.5">
                {metrics.peakHours.length === 0 ? (
                  <div className="text-center py-4 text-[10px] text-on-surface-variant/40 font-black uppercase tracking-wider">
                    No timeline metrics
                  </div>
                ) : (
                  metrics.peakHours.map((slot, index) => {
                    const maxOrders = Math.max(...metrics.peakHours.map((s) => s.count), 1);
                    const pct = Math.round((slot.count / maxOrders) * 100);
                    return (
                      <div key={index} className="flex items-center gap-3">
                        <span className="text-[9px] font-black text-on-surface-variant opacity-75 uppercase w-28 truncate">
                          {slot.name}
                        </span>
                        <div className="flex-1 bg-surface-container-high h-2 rounded-full overflow-hidden">
                          <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[9px] font-black text-on-surface w-8 text-right">
                          {slot.count} ord
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: Full Sales Table */}
        <div className="bg-surface border-2 border-outline rounded-2xl shadow-hard overflow-hidden flex flex-col min-h-[500px]">
          <div className="px-6 py-4 border-b border-outline bg-surface-container-low/50">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em]">
                Sales Log ({filteredOrders.length})
              </h3>
              <span className="text-[10px] font-black text-on-surface-variant opacity-50 uppercase tracking-widest">
                Page {currentPage} of {Math.max(1, Math.ceil(filteredOrders.length / ROWS_PER_PAGE))}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-10 bg-black text-white select-none">
                <tr className="uppercase text-[9px] tracking-widest font-black">
                  <th 
                    className="px-6 py-4 cursor-pointer hover:bg-neutral-800 transition-colors w-[15%]"
                    onClick={() => handleSort("refCode")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Ref Code</span>
                      {renderSortIcon("refCode")}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 hide-on-tablet cursor-pointer hover:bg-neutral-800 transition-colors w-[25%]"
                    onClick={() => handleSort("client")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Client Profile</span>
                      {renderSortIcon("client")}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 hide-on-mobile cursor-pointer hover:bg-neutral-800 transition-colors w-[15%]"
                    onClick={() => handleSort("method")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Method</span>
                      {renderSortIcon("method")}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 hide-on-mobile cursor-pointer hover:bg-neutral-800 transition-colors w-[15%]"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Payment</span>
                      {renderSortIcon("status")}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 hide-on-mobile cursor-pointer hover:bg-neutral-800 transition-colors w-[15%]"
                    onClick={() => handleSort("delivery")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Delivery</span>
                      {renderSortIcon("delivery")}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-right w-[10%]">Total Price</th>
                  <th className="px-6 py-4 text-right w-[5%]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-outline-variant/30">
                {filteredOrders.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE).map((order) => (
                  <React.Fragment key={order._id}>
                    <tr
                      className={cn(
                        "hover:bg-primary/5 transition-all cursor-pointer group",
                        expandedOrder === order._id && "bg-primary/5"
                      )}
                      onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="hidden sm:flex w-9 h-9 rounded-xl bg-surface-container-high border border-outline items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-all">
                            <Receipt className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-display text-on-surface text-sm lg:text-base uppercase tracking-wider">
                              {order.orderCode ?? `#${order._id.slice(-6).toUpperCase()}`}
                            </p>
                            <p className="text-[9px] font-black text-on-surface-variant flex items-center gap-1 uppercase tracking-tighter opacity-60">
                              <Clock className="w-3 h-3" /> {format(order.createdAt, "HH:mm")}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 hide-on-tablet">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                            <User className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-on-surface uppercase text-xs tracking-wider">
                              {(order as any).customer?.name || "Generic Client"}
                            </span>
                            {order.username && (
                              <span className="text-[9px] text-on-surface-variant font-medium lowercase">
                                seller: @{order.username}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 hide-on-mobile">
                        {order.payments && order.payments.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {order.payments.map((p: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-1.5 text-[9px] font-black text-on-surface uppercase tracking-wider">
                                {getMethodIcon(p.method)}
                                <span>{p.method}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[9px] font-black text-on-surface uppercase tracking-widest">
                            {getMethodIcon(order.amountPaid === 0 ? "Debt" : (order.paymentMethod || "Cash"))}
                            {order.amountPaid === 0 ? "Debt" : order.paymentMethod}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 hide-on-mobile">
                        <div
                          className={cn(
                            "inline-flex items-center px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border",
                            getStatusColor(order.status)
                          )}
                        >
                          {order.status}
                        </div>
                      </td>
                      <td className="px-6 py-4 hide-on-mobile">
                        <span className={cn(
                          "inline-flex items-center px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border",
                          order.orderType === "delivery"
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-surface-container-high text-on-surface-variant border-outline-variant"
                        )}>
                          {order.orderType === "delivery" ? "Delivery" : "Pickup"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="font-display text-base lg:text-xl text-primary tracking-tighter">
                          {formatCurrency(order.total)}
                        </p>
                        {order.remainingAmount > 0 && (
                          <p className="text-[9px] font-black text-error uppercase tracking-tighter">
                            Debt: {formatCurrency(order.remainingAmount)}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOrderToDelete(order);
                            }}
                            className="p-2 rounded-xl text-error hover:bg-error/10 border border-transparent hover:border-outline-variant transition-all hide-on-mobile"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          {expandedOrder === order._id ? (
                            <ChevronUp className="w-4 h-4 text-on-surface-variant" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-on-surface-variant" />
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expandable Order detail view */}
                    <AnimatePresence>
                      {expandedOrder === order._id && (
                        <tr>
                          <td colSpan={7} className="p-0">
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden bg-surface-container-low/40 px-6 py-4 border-b border-outline"
                            >
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                  <h4 className="text-[9px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-3">
                                    Items Ordered
                                  </h4>
                                  <div className="space-y-2">
                                    {!expandedItems ? (
                                      <div className="flex justify-center p-4 opacity-50">
                                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                      </div>
                                    ) : (expandedItems.length > 0 ? expandedItems : (order.items || [])).length === 0 ? (
                                      <p className="text-xs text-on-surface-variant opacity-60 px-2">No items found</p>
                                    ) : (
                                      (expandedItems.length > 0 ? expandedItems : (order.items || [])).map((item: any, idx: number) => (
                                        <div key={idx} className="flex flex-col bg-surface p-3 rounded-xl border border-outline shadow-hard-sm gap-2">
                                          <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                              <span className="w-6 h-6 rounded bg-black text-white flex items-center justify-center font-black text-[10px]">
                                                {item.quantity}
                                              </span>
                                              <span className="font-bold text-on-surface uppercase text-xs tracking-wider">
                                                {item.dishName}
                                              </span>
                                            </div>
                                            <span className="font-display text-on-surface-variant text-sm">
                                              {formatCurrency(
                                                (item.priceAtTime ?? item.price ?? 0) * item.quantity +
                                                  (item.modifiers || []).reduce((sum: number, m: any) => sum + m.price, 0) +
                                                  (item.comboSelections || []).reduce(
                                                    (sum: number, c: any) => sum + c.extraCharge,
                                                    0
                                                  )
                                              )}
                                            </span>
                                          </div>

                                          {/* Modifiers */}
                                          {item.modifiers && item.modifiers.length > 0 && (
                                            <div className="pl-2 border-l border-primary/20 space-y-1">
                                              {item.modifiers.map((mod: any, i: number) => (
                                                <p key={i} className="text-[9px] font-bold text-on-surface-variant/80 flex justify-between">
                                                  <span>🍳 {mod.name}</span>
                                                  <span className="text-primary font-black">+{formatCurrency(mod.price)}</span>
                                                </p>
                                              ))}
                                            </div>
                                          )}

                                          {/* Combo Selections */}
                                          {item.comboSelections && item.comboSelections.length > 0 && (
                                            <div className="pl-2 border-l border-primary/20 space-y-1">
                                              {item.comboSelections.map((sel: any, i: number) => (
                                                <p key={i} className="text-[9px] font-bold text-on-surface-variant/80 flex justify-between">
                                                  <span>
                                                    {sel.category === "Free Pizza Upgrade" ? "🍕 Promo" : `🥗 ${sel.category}`}: {sel.name}
                                                  </span>
                                                  {sel.extraCharge > 0 && (
                                                    <span className="text-primary font-black">+{formatCurrency(sel.extraCharge)}</span>
                                                  )}
                                                </p>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>

                                <div className="bg-surface rounded-xl p-4 border border-outline shadow-hard-sm flex flex-col justify-between">
                                  <div>
                                    <h4 className="text-[9px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-3">
                                      Financial Breakdown
                                    </h4>
                                    <div className="space-y-1.5 text-xs font-bold uppercase tracking-wider">
                                      <div className="flex justify-between">
                                        <span>Food Subtotal</span>
                                        <span>{formatCurrency(order.total - (order.deliveryFeeAmount ?? 0))}</span>
                                      </div>
                                      {order.orderType === "delivery" && (
                                        <div className="flex justify-between">
                                          <span>Delivery Fee</span>
                                          <span>{formatCurrency(order.deliveryFeeAmount ?? 0)}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between pt-1.5 border-t border-dashed border-outline-variant/50">
                                        <span>Total Bill</span>
                                        <span>{formatCurrency(order.total)}</span>
                                      </div>
                                      <div className="flex justify-between text-green-500">
                                        <span>Amount Paid</span>
                                        <span>{formatCurrency(order.amountPaid)}</span>
                                      </div>
                                      {order.change > 0 && (
                                        <div className="flex justify-between text-on-surface-variant/75">
                                          <span>Change Returned</span>
                                          <span>{formatCurrency(order.change)}</span>
                                        </div>
                                      )}
                                      {order.username && (
                                        <div className="flex justify-between text-on-surface-variant/75 pt-1.5 border-t border-dashed border-outline-variant">
                                          <span>Registered By</span>
                                          <span className="lowercase font-black">@{order.username}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="pt-3 border-t border-outline-variant mt-4 flex justify-between font-display text-xl">
                                    <span className="uppercase tracking-tighter">
                                      {order.remainingAmount > 0 ? "Outstanding" : "Balance"}
                                    </span>
                                    <span className={order.remainingAmount > 0 ? "text-error" : "text-green-500"}>
                                      {formatCurrency(order.remainingAmount)}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => setOrderToManagePayments(order)}
                                    className="mt-4 w-full py-2 bg-surface-container-highest border border-outline rounded-xl font-black text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary hover:border-primary/50 transition-all active:scale-95 shadow-soft"
                                  >
                                    Manage Payments
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                ))}

                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-8 py-20 text-center text-on-surface-variant font-bold uppercase tracking-widest opacity-40">
                      <Receipt className="w-12 h-12 mx-auto mb-3" />
                      No sales found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredOrders.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 bg-black text-white font-black text-[10px] uppercase tracking-wider">
                  <tr className="border-t-4 border-outline">
                    <td className="px-6 py-4">Totals ({filteredOrders.length})</td>
                    <td className="px-6 py-4"></td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-black uppercase tracking-wider">
                        {(() => {
                          const totalsMap: Record<string, number> = {};
                          filteredOrders.forEach((o) => {
                            const payments = (o as any).payments || [];
                            if (payments.length > 0) {
                              payments.forEach((p: any) => {
                                totalsMap[p.method] = (totalsMap[p.method] || 0) + p.amount;
                              });
                            } else {
                              const method = o.paymentMethod || "Cash";
                              totalsMap[method] = (totalsMap[method] || 0) + o.amountPaid;
                            }
                          });
                          return Object.entries(totalsMap).map(([method, amount], idx) => (
                            <span key={idx} className="whitespace-nowrap">
                              {method}: <span className="text-primary font-extrabold">{formatCurrency(amount)}</span>
                            </span>
                          ));
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4"></td>
                    <td className="px-6 py-4"></td>
                    <td className="px-6 py-4 text-right text-lg font-display text-primary">
                      {formatCurrency(filteredOrders.reduce((acc, o) => acc + o.total, 0))}
                    </td>
                    <td className="px-6 py-4"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination Controls */}
          {filteredOrders.length > ROWS_PER_PAGE && (
            <div className="px-6 py-4 border-t-2 border-outline flex items-center justify-between bg-surface-container-low/40">
              <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider opacity-60">
                Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, filteredOrders.length)} of {filteredOrders.length} transactions
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 text-[9px] font-black uppercase tracking-widest bg-surface border-2 border-outline rounded-xl hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-hard-sm active:scale-95"
                >
                  ← Prev
                </button>

                {Array.from({ length: Math.ceil(filteredOrders.length / ROWS_PER_PAGE) }, (_, i) => i + 1)
                  .filter((page) => page === 1 || page === Math.ceil(filteredOrders.length / ROWS_PER_PAGE) || Math.abs(page - currentPage) <= 1)
                  .reduce<(number | "...")[]>((acc, page, idx, arr) => {
                    if (idx > 0 && (page as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                    acc.push(page);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "..." ? (
                      <span key={`ellipsis-${idx}`} className="text-[10px] font-black text-on-surface-variant opacity-40 px-1">
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setCurrentPage(item as number)}
                        className={cn(
                          "w-9 h-9 rounded-xl text-[10px] font-black uppercase border-2 transition-all shadow-hard-sm active:scale-95",
                          currentPage === item
                            ? "bg-primary text-on-primary border-outline"
                            : "bg-surface text-on-surface border-outline-variant hover:border-primary/50"
                        )}
                      >
                        {item}
                      </button>
                    )
                  )}

                <button
                  onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredOrders.length / ROWS_PER_PAGE), p + 1))}
                  disabled={currentPage === Math.ceil(filteredOrders.length / ROWS_PER_PAGE)}
                  className="px-4 py-2 text-[9px] font-black uppercase tracking-widest bg-surface border-2 border-outline rounded-xl hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-hard-sm active:scale-95"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface w-full max-w-lg rounded-[2rem] shadow-2xl p-8 border border-outline"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-error/10 flex items-center justify-center text-error">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-on-surface uppercase tracking-wider leading-tight">Cancel Transaction?</h2>
            </div>
            <p className="text-on-surface-variant font-medium text-xs mb-6 leading-relaxed">
              Are you sure you want to delete Order <span className="font-black text-on-surface">{(orderToDelete as any).orderCode ?? `#${orderToDelete._id.slice(-6)}`}</span>?
              <br /><br />
              This action will <strong className="text-error font-black">restore inventory stock</strong> and remove this record permanently.
            </p>
            <div className="flex gap-4 text-xs font-black uppercase">
              <button
                onClick={() => setOrderToDelete(null)}
                className="flex-1 py-3.5 rounded-xl border-2 border-outline font-bold text-on-surface-variant hover:bg-surface-container-high transition-all"
              >
                Go Back
              </button>
              <button
                disabled={isDeletingOrder}
                onClick={async () => {
                  if (isDeletingOrder) return;
                  setIsDeletingOrder(true);
                  try {
                    await removeOrder({ id: orderToDelete._id });
                    toast.success("Transaction cancelled and inventory restored!");
                    setOrderToDelete(null);
                  } catch (e: any) {
                    if (e.message?.includes("Order not found")) {
                      toast.info("Order was already removed.");
                      setOrderToDelete(null);
                    } else {
                      toast.error("Failed to delete sale: " + e.message);
                    }
                  } finally {
                    setIsDeletingOrder(false);
                  }
                }}
                className={`flex-1 py-3.5 rounded-xl transition-all shadow-hard active:scale-95 border-2 border-outline ${isDeletingOrder ? "bg-error/50 text-on-error cursor-not-allowed" : "bg-error text-on-error hover:bg-error/90"}`}
              >
                {isDeletingOrder ? "Deleting..." : "Delete Sale"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </PageLayout>
  );
}
