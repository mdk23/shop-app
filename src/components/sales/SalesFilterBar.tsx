"use client";

import { Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type DateRangeType = {
  start: number;
  end: number;
  label: string;
};

interface SalesFilterBarProps {
  statusFilter: "All" | "Completed" | "Pending" | "Cancelled";
  setStatusFilter: (status: "All" | "Completed" | "Pending" | "Cancelled") => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  methodFilter: string;
  setMethodFilter: (method: string) => void;
  fulfillmentFilter: "All" | "Pickup" | "Delivery";
  setFulfillmentFilter: (fulfillment: "All" | "Pickup" | "Delivery") => void;
  sellerFilter: string;
  setSellerFilter: (seller: string) => void;
  uniqueSellers: string[];
  dateRange: DateRangeType;
  setDateRange: React.Dispatch<React.SetStateAction<DateRangeType>>;
  onReset: () => void;
  hasFiltersActive: boolean;
}

export function SalesFilterBar({
  statusFilter,
  setStatusFilter,
  searchTerm,
  setSearchTerm,
  methodFilter,
  setMethodFilter,
  fulfillmentFilter,
  setFulfillmentFilter,
  sellerFilter,
  setSellerFilter,
  uniqueSellers,
  dateRange,
  setDateRange,
  onReset,
  hasFiltersActive,
}: SalesFilterBarProps) {
  return (
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
                    start: new Date(e.target.value).getTime(),
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
                    end: new Date(e.target.value).getTime() + 86399999, // end of the selected day
                    label: "Custom",
                  }));
                }
              }}
              className="bg-surface border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary transition-all font-black text-[9px] h-10"
            />
          </div>

          {/* Reset filter */}
          {hasFiltersActive && (
            <button
              onClick={onReset}
              className="h-10 px-4 bg-error text-on-error border-2 border-outline rounded-xl hover:bg-secondary active:scale-95 transition-all text-[9px] font-black uppercase tracking-widest shadow-hard-sm"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
