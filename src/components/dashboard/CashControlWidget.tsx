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
        <div className="bg-surface border-2 border-outline rounded-2xl p-5 shadow-hard flex flex-col justify-between">
          <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3 mb-4">
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Drawer expected Cash</span>
            <div className="p-1 bg-primary/10 rounded text-primary"><Banknote className="w-3.5 h-3.5" /></div>
          </div>
          <div>
            {activeSession ? (
              <div className="space-y-1">
                <p className="text-3xl font-display text-on-surface leading-none">
                  {formatCurrency((activeSession as any).expectedCash || activeSession.openingAmount)}
                </p>
                <p className="text-[9px] font-black uppercase text-on-surface-variant/60 tracking-wider pt-2">
                  Opening + Cash Sales + Cash Ins - Cash Outs
                </p>
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant/50 uppercase font-black">Open the register to view live expected cash.</p>
            )}
          </div>
        </div>

        {/* Sub-cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Cash Session Status */}
          <div className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Caixa Status</span>
              <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-black uppercase border shadow-hard-sm",
                activeSession ? "bg-green-500/10 text-green-500 border-green-500/20 animate-pulse" : "bg-red-500/10 text-red-500 border-red-500/20"
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
                <p className="text-[9px] text-on-surface-variant/50 uppercase font-black">No active session.</p>
              )}
            </div>
          </div>

          {/* Discrepancy Log */}
          <div className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col justify-between">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Discrepancies</span>
              <span className={cn("px-1.5 py-0.5 rounded text-[8px] font-black uppercase border",
                discrepancySum === 0 ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
              )}>
                {discrepancySum === 0 ? "Balanced" : discrepancySum > 0 ? `+${discrepancySum.toFixed(2)}` : `${discrepancySum.toFixed(2)}`}
              </span>
            </div>
            <div>
              {closedSessions.length === 0 ? (
                <p className="text-[9px] text-on-surface-variant/50 uppercase font-black">No recent data.</p>
              ) : (
                <div className="space-y-1 max-h-[60px] overflow-auto text-[8px] font-bold uppercase tracking-wider text-on-surface-variant/80">
                  {closedSessions.slice(0, 3).map((s, idx) => (
                    <div key={idx} className="flex justify-between border-b border-dashed border-outline-variant/30 pb-0.5 last:border-0 last:pb-0">
                      <span>@{s.username}</span>
                      <span className={s.difference === 0 ? "text-green-500" : "text-error font-black"}>
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
