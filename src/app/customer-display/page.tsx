"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

export default function CustomerDisplayPage() {
  const activeOrders = useQuery(api.orders.listActiveOrders, {}) || [];

  // Group by status
  const preparingOrders = activeOrders.filter(o => o.prepStatus === "pending" || o.prepStatus === "preparing");
  const readyOrders = activeOrders.filter(o => o.prepStatus === "ready");

  const [time, setTime] = useState("");
  useEffect(() => {
    const updateTime = () => setTime(new Date().toLocaleTimeString());
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-surface flex flex-col font-sans selection:bg-primary selection:text-on-primary">
      {/* Header */}
      <header className="bg-surface-container-lowest border-b-4 border-outline px-8 py-6 flex items-center justify-between">
        <h1 className="text-4xl font-black text-on-surface uppercase tracking-widest flex items-center gap-4">
          <span className="w-6 h-6 rounded-full bg-primary animate-pulse"></span>
          Shop App Orders
        </h1>
        <div className="flex items-center gap-3 text-2xl font-bold text-on-surface-variant bg-surface border-2 border-outline px-6 py-3 rounded-2xl shadow-hard">
          <Clock className="w-8 h-8 text-primary" />
          {time}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 grid grid-cols-2 p-8 gap-8">
        
        {/* Preparing Column */}
        <section className="flex flex-col bg-surface border-4 border-outline rounded-[3rem] shadow-hard-lg overflow-hidden">
          <div className="bg-warning/20 border-b-4 border-outline p-6 text-center">
            <h2 className="text-4xl font-black text-warning-dark uppercase tracking-widest">
              Preparing
            </h2>
          </div>
          <div className="flex-1 p-8 grid grid-cols-2 gap-4 content-start overflow-y-auto bg-surface-container-lowest">
            <AnimatePresence>
              {preparingOrders.map(order => (
                <motion.div
                  key={order._id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  layout
                  className="bg-surface border-4 border-outline rounded-3xl p-6 text-center shadow-hard flex items-center justify-center min-h-[120px]"
                >
                  <span className="text-5xl font-black text-on-surface tracking-widest">
                    {order.orderCode || `#${order._id.slice(-4).toUpperCase()}`}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
            {preparingOrders.length === 0 && (
              <div className="col-span-2 text-center py-20 text-on-surface-variant/50 font-black text-2xl uppercase tracking-widest">
                No orders preparing
              </div>
            )}
          </div>
        </section>

        {/* Ready Column */}
        <section className="flex flex-col bg-surface border-4 border-outline rounded-[3rem] shadow-hard-lg overflow-hidden">
          <div className="bg-success/20 border-b-4 border-outline p-6 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-success/10 animate-pulse"></div>
            <h2 className="text-4xl font-black text-success-dark uppercase tracking-widest relative z-10 flex items-center justify-center gap-4">
              <span className="w-4 h-4 rounded-full bg-success"></span>
              Ready to Collect
              <span className="w-4 h-4 rounded-full bg-success"></span>
            </h2>
          </div>
          <div className="flex-1 p-8 grid grid-cols-1 gap-6 content-start overflow-y-auto bg-surface-container-lowest">
            <AnimatePresence>
              {readyOrders.map(order => (
                <motion.div
                  key={order._id}
                  initial={{ opacity: 0, x: -50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  layout
                  className="bg-success text-on-primary border-4 border-success-dark rounded-3xl p-8 text-center shadow-hard-lg flex flex-col items-center justify-center min-h-[160px] animate-in slide-in-from-left"
                >
                  <span className="text-7xl font-black tracking-widest drop-shadow-md">
                    {order.orderCode || `#${order._id.slice(-4).toUpperCase()}`}
                  </span>
                  <span className="mt-2 text-xl font-bold opacity-90 uppercase tracking-[0.2em]">
                    Please Collect
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
            {readyOrders.length === 0 && (
              <div className="text-center py-20 text-on-surface-variant/50 font-black text-2xl uppercase tracking-widest">
                No orders waiting
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
