"use client";

import React from "react";
import { Search } from "lucide-react";

interface StockFiltersRibbonProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  movementTypeFilter: string;
  setMovementTypeFilter: (type: string) => void;
  selectedItemId: string;
  setSelectedItemId: (id: string) => void;
  refTypeFilter: string;
  setRefTypeFilter: (ref: string) => void;
  selectedUser: string;
  setSelectedUser: (usr: string) => void;
  ingredients: any[] | undefined;
  filterUsersList: string[];
  setCurrentPage: (page: number) => void;
}

export function StockFiltersRibbon({
  searchTerm,
  setSearchTerm,
  movementTypeFilter,
  setMovementTypeFilter,
  selectedItemId,
  setSelectedItemId,
  refTypeFilter,
  setRefTypeFilter,
  selectedUser,
  setSelectedUser,
  ingredients,
  filterUsersList,
  setCurrentPage,
}: StockFiltersRibbonProps) {
  return (
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
  );
}
