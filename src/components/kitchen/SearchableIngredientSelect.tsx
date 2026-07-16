"use client";

import { useState, useRef } from "react";
import { Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchableIngredientSelectProps {
  value: string;
  onChange: (id: string) => void;
  options: any[];
  placeholder?: string;
}

export function SearchableIngredientSelect({
  value,
  onChange,
  options,
  placeholder = "Search ingredient..."
}: SearchableIngredientSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  
  const selectedOption = options.find((opt) => opt._id === value);
  const filtered = options.filter((opt) =>
    opt.name.toLowerCase().includes(search.toLowerCase())
  );

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
    setIsOpen(true);
    setSearch("");
  };

  return (
    <div className="relative w-full">
      <div
        ref={triggerRef}
        onClick={() => {
          if (isOpen) setIsOpen(false);
          else openDropdown();
        }}
        className="w-full bg-surface-container-high border-2 border-black rounded-xl px-4 py-3 text-on-surface font-black uppercase tracking-wider text-[11px] cursor-pointer flex justify-between items-center transition-colors hover:border-primary"
      >
        <span className="truncate">{selectedOption ? selectedOption.name : placeholder}</span>
        <ChevronDown className="w-4 h-4 opacity-40 flex-shrink-0 ml-2" />
      </div>

      {isOpen && (
        <>
          {/* Overlay to catch clicks outside the dropdown */}
          <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
          <div 
            className="absolute bg-surface border-2 border-black rounded-2xl shadow-hard z-[105] max-h-[400px] flex flex-col p-2.5 mt-1"
            style={{ width: coords.width }}
          >
            <div className="relative mb-2 shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40 text-on-surface" />
              <input
                type="text"
                autoFocus
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-surface-container-high border border-outline-variant rounded-lg pl-8 pr-3 py-2 text-[10px] font-bold uppercase outline-none focus:border-primary text-on-surface"
              />
            </div>
            <div className="overflow-y-auto flex-1 max-h-[250px]">
              {filtered.length === 0 ? (
                <span className="text-[10px] text-on-surface-variant p-2 uppercase font-bold italic opacity-60 block">No items found</span>
              ) : (
                filtered.map((opt) => (
                  <div
                    key={opt._id}
                    onClick={() => {
                      onChange(opt._id);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-primary hover:text-on-primary transition-colors text-on-surface mb-0.5 flex justify-between items-center",
                      opt._id === value && "bg-primary/10 text-primary border border-primary/20"
                    )}
                  >
                    <div>
                      <div>{opt.name}</div>
                      <div className="text-[8px] font-bold opacity-60">{opt.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="opacity-80">{opt.stockQuantity}</div>
                      <div className="text-[8px] font-bold opacity-60">{opt.unit}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
