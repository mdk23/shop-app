"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useState, useMemo, useEffect } from "react";
import { PageLayout } from "@/components/PageLayout";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, ChefHat, CheckCircle, Bell, ArrowRight, Store } from "lucide-react";
import { useBranch } from "@/contexts/BranchContext";

type PrepStatus = "pending" | "preparing" | "ready" | "completed";

export default function ActiveOrdersPage() {
  const { selectedBranchId } = useBranch();
  const branches = useQuery(api.branches.listAll);
  const activeOrders = useQuery(api.orders.listActiveOrders, { branchId: selectedBranchId }) || [];
  const updatePrepStatus = useMutation(api.orders.updatePrepStatus);

  const branchMap = useMemo(() => {
    const map: Record<string, string> = {};
    (branches || []).forEach((b) => {
      map[b._id] = b.code || b.name;
    });
    return map;
  }, [branches]);

  const defaultBranchCode = useMemo(() => {
    const def = (branches || []).find((b) => b.isDefault);
    return def ? (def.code || def.name) : "LOJA 1";
  }, [branches]);

  // Group by status
  const pendingOrders = activeOrders.filter(o => o.prepStatus === "pending");
  const preparingOrders = activeOrders.filter(o => o.prepStatus === "preparing");
  const readyOrders = activeOrders.filter(o => o.prepStatus === "ready");

  const handleUpdateStatus = async (orderId: Id<"orders">, status: PrepStatus) => {
    await updatePrepStatus({ orderId, status });
  };

  return (
    <PageLayout title="Active Orders" subtitle="Live Kitchen & Preparation Pipeline" isFullWidth>
      <div className="flex flex-col gap-6 h-full pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        
        {/* Pending Column */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-black text-on-surface uppercase tracking-widest flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-error animate-pulse"></span>
              New Orders
            </h2>
            <span className="bg-surface border-2 border-outline px-3 py-1 rounded-full text-xs font-bold">
              {pendingOrders.length}
            </span>
          </div>
          <div className="flex-1 bg-surface-container-lowest rounded-3xl border-2 border-outline/50 p-4 overflow-y-auto flex flex-col gap-4">
            <AnimatePresence>
              {pendingOrders.map(order => (
                <OrderCard 
                  key={order._id} 
                  order={order}
                  branchCode={order.branchId ? (branchMap[order.branchId] || "BRANCH") : defaultBranchCode}
                  onAction={() => handleUpdateStatus(order._id, "preparing")}
                  actionLabel="Start Preparing"
                  actionColor="bg-primary hover:bg-primary/90 text-on-primary"
                  actionIcon={<ChefHat className="w-4 h-4" />}
                />
              ))}
            </AnimatePresence>
            {pendingOrders.length === 0 && <EmptyState text="No new orders" />}
          </div>
        </div>

        {/* Preparing Column */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-black text-on-surface uppercase tracking-widest flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-warning"></span>
              Preparing
            </h2>
            <span className="bg-surface border-2 border-outline px-3 py-1 rounded-full text-xs font-bold">
              {preparingOrders.length}
            </span>
          </div>
          <div className="flex-1 bg-surface-container-lowest rounded-3xl border-2 border-outline/50 p-4 overflow-y-auto flex flex-col gap-4">
            <AnimatePresence>
              {preparingOrders.map(order => (
                <OrderCard 
                  key={order._id} 
                  order={order}
                  branchCode={order.branchId ? (branchMap[order.branchId] || "BRANCH") : defaultBranchCode}
                  onAction={() => handleUpdateStatus(order._id, "ready")}
                  actionLabel="Mark as Ready"
                  actionColor="bg-success hover:bg-success/90 text-on-primary"
                  actionIcon={<CheckCircle className="w-4 h-4" />}
                />
              ))}
            </AnimatePresence>
            {preparingOrders.length === 0 && <EmptyState text="No orders preparing" />}
          </div>
        </div>

        {/* Ready Column */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-black text-on-surface uppercase tracking-widest flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-success"></span>
              Ready
            </h2>
            <span className="bg-surface border-2 border-outline px-3 py-1 rounded-full text-xs font-bold">
              {readyOrders.length}
            </span>
          </div>
          <div className="flex-1 bg-surface-container-lowest rounded-3xl border-2 border-outline/50 p-4 overflow-y-auto flex flex-col gap-4">
            <AnimatePresence>
              {readyOrders.map(order => (
                <OrderCard 
                  key={order._id} 
                  order={order} 
                  branchCode={order.branchId ? (branchMap[order.branchId] || "BRANCH") : defaultBranchCode}
                  onAction={() => handleUpdateStatus(order._id, "completed")}
                  actionLabel="Finish (Collect)"
                  actionColor="bg-surface border-2 border-outline hover:bg-surface-container text-on-surface"
                  actionIcon={<ArrowRight className="w-4 h-4" />}
                />
              ))}
            </AnimatePresence>
            {readyOrders.length === 0 && <EmptyState text="No ready orders" />}
          </div>
        </div>
      </div>
      </div>
    </PageLayout>
  );
}

function OrderCard({ order, branchCode, onAction, actionLabel, actionColor, actionIcon }: any) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const ms = Date.now() - order.createdAt;
      const mins = Math.floor(ms / 60000);
      if (mins === 0) setElapsed("Just now");
      else setElapsed(`${mins} min`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [order.createdAt]);

  const isTakeaway = order.orderType === "takeaway" || order.orderType === "pickup" || !order.orderType;
  const typeLabel = isTakeaway ? "Takeaway" : "Delivery";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      layout
      className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col gap-3 relative overflow-hidden"
    >
      {/* Top Banner (Order ID & Type) */}
      <div className="flex items-center justify-between pb-3 border-b-2 border-outline border-dashed">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-black text-on-surface bg-surface-container px-2 py-1 rounded-lg">
            {order.orderCode || `#${order._id.slice(-4).toUpperCase()}`}
          </span>
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-surface-container-high border border-outline/40 text-primary flex items-center gap-1 shadow-xs">
            <Store className="w-3 h-3 text-primary" />
            {branchCode}
          </span>
          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${isTakeaway ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning-dark'}`}>
            {typeLabel}
          </span>
          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
            order.status === "Paid" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" :
            order.status === "Partially Paid" ? "bg-blue-500/10 text-blue-600 border-blue-500/30" :
            "bg-amber-500/10 text-amber-600 border-amber-500/30"
          }`}>
            {order.status === "Paid" ? "Paid" : order.status === "Partially Paid" ? "Partially Paid" : "Pending Payment"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-on-surface-variant text-xs font-bold">
          <Clock className="w-3 h-3" />
          {elapsed}
        </div>
      </div>

      {order.customerName && (
        <div className="text-[11px] font-black text-on-surface-variant uppercase tracking-wider">
          Client: <span className="text-on-surface">{order.customerName}</span>
        </div>
      )}

      {/* Items List */}
      <div className="flex flex-col gap-2 py-2">
        {order.itemSummary?.map((item: any, i: number) => (
          <div key={i} className="flex items-start gap-2">
            <span className="font-black text-primary text-sm min-w-[1.5rem]">{item.quantity}x</span>
            <div className="flex flex-col">
              <span className="font-bold text-on-surface text-sm leading-tight">{item.dishName}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Action Button */}
      <button 
        onClick={onAction}
        className={`mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-colors ${actionColor}`}
      >
        {actionIcon}
        {actionLabel}
      </button>
    </motion.div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex-1 flex items-center justify-center text-center p-6">
      <p className="text-on-surface-variant font-bold text-sm tracking-widest uppercase opacity-50">
        {text}
      </p>
    </div>
  );
}
