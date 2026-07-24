"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTheme, THEME_OPTIONS, ThemeKey } from "@/contexts/ThemeContext";
import { Palette, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, currentThemeOption } = useTheme();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative z-50" ref={dropdownRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        id="theme-selector-btn"
        className={cn(
          "flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-surface border border-outline/30 hover:bg-surface-container hover:border-outline/50 transition-all cursor-pointer shadow-sm",
          compact && "p-2"
        )}
        title="Switch Color Theme"
      >
        <div className="flex items-center gap-1.5">
          <Palette className="w-4 h-4 text-primary" />
          <div className="flex items-center gap-1">
            <span
              className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-sm"
              style={{ backgroundColor: currentThemeOption.primary }}
            />
            <span
              className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-sm"
              style={{ backgroundColor: currentThemeOption.accent }}
            />
          </div>
        </div>

        {!compact && (
          <span className="text-[11px] font-bold text-on-surface uppercase tracking-wider hidden md:inline">
            {currentThemeOption.name.split("&")[0]}
          </span>
        )}

        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-on-surface-variant transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-surface/95 backdrop-blur-xl border border-outline/30 rounded-2xl shadow-xl z-[100] overflow-hidden p-2 space-y-1.5">
          <div className="px-3 py-2 border-b border-outline/20 mb-1">
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
              SELECT COLOR THEME
            </p>
            <p className="text-xs text-on-surface font-semibold">
              Full interface color transformation
            </p>
          </div>

          {THEME_OPTIONS.map((opt) => {
            const isSelected = theme === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => {
                  setTheme(opt.key);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group cursor-pointer",
                  isSelected
                    ? "bg-primary/10 border-primary/40 shadow-sm"
                    : "border-transparent hover:bg-surface-container/70"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1 items-center">
                    <span
                      className="w-4 h-4 rounded-full border border-black/15 shadow-sm"
                      style={{ backgroundColor: opt.primary }}
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-black/15 shadow-sm"
                      style={{ backgroundColor: opt.accent }}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface group-hover:text-primary transition-colors">
                      {opt.name}
                    </p>
                    <p className="text-[10px] text-on-surface-variant line-clamp-1 font-medium">
                      {opt.description}
                    </p>
                  </div>
                </div>

                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
