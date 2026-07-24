"use client";

import React from "react";
import { Banknote } from "lucide-react";
import { format } from "date-fns";
import { cn, formatCurrency } from "@/lib/utils";

interface CashControlWidgetProps {
  activeSession: any;
  closedSessions: any[];
  discrepancySum: number;
}

export function CashControlWidget({
  activeSession,
  closedSessions,
  discrepancySum,
}: CashControlWidgetProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80">Operations & Cash Control</h3>
      <div className="flex flex-col gap-4">
        {/* Expected Cash Drawer Balance - Main Card */}
        <div className="bg-surface border border-outline/30 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
          <div className="flex justify-between items-center border-b border-outline/30 pb-3 mb-4">
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Drawer expected Cash</span>
            <div className="p-1 bg-primary/10 rounded-lg text-primary"><Banknote className="w-4 h-4" /></div>
          </div>
          <div>
            {activeSession ? (
              <div className="space-y-1">
                <p className="text-3xl font-display text-on-surface leading-none">
                  {formatCurrency((activeSession as any).expectedCash || activeSession.openingAmount)}
                </p>
                <p className="text-[9px] font-bold uppercase text-on-surface-variant/60 tracking-wider pt-2">
                  Opening + Cash Sales + Cash Ins - Cash Outs
                </p>
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant/60 uppercase font-bold">Open the register to view live expected cash.</p>
            )}
          </div>
        </div>

        {/* Sub-cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Cash Session Status */}
          <div className="bg-surface border border-outline/30 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Caixa Status</span>
              <span className={cn("px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border shadow-sm",
                activeSession ? "bg-primary/10 text-primary border-primary/20 animate-pulse" : "bg-error/10 text-error border-error/20"
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
                <p className="text-[9px] text-on-surface-variant/60 uppercase font-bold">No active session.</p>
              )}
            </div>
          </div>

          {/* Discrepancy Log */}
          <div className="bg-surface border border-outline/30 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Discrepancies</span>
              <span className={cn("px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border shadow-sm",
                discrepancySum === 0 ? "bg-primary/10 text-primary border-primary/20" : "bg-error/10 text-error border-error/20"
              )}>
                {discrepancySum === 0 ? "Balanced" : discrepancySum > 0 ? `+${discrepancySum.toFixed(2)}` : `${discrepancySum.toFixed(2)}`}
              </span>
            </div>
            <div>
              {closedSessions.length === 0 ? (
                <p className="text-[9px] text-on-surface-variant/60 uppercase font-bold">No recent data.</p>
              ) : (
                <div className="space-y-1 max-h-[60px] overflow-auto text-[8px] font-bold uppercase tracking-wider text-on-surface-variant/80">
                  {closedSessions.slice(0, 3).map((s, idx) => (
                    <div key={idx} className="flex justify-between border-b border-dashed border-outline-variant/30 pb-0.5 last:border-0 last:pb-0">
                      <span>@{s.username}</span>
                      <span className={s.difference === 0 ? "text-primary" : "text-error font-black"}>
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
  );
}
