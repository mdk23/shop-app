"use client";

import React from "react";
import { format } from "date-fns";
import { X, FileText, Trash2, Pencil, ArrowRight, CheckCircle, XCircle } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface PODetailDrawerProps {
  poDetails: any;
  onClose: () => void;
  token: string | null;
  onUpdatePaymentStatus: (id: string, paymentStatus: string) => Promise<void>;
  onDeletePO: (poDetails: any) => void;
  onEditPO: (poDetails: any) => void;
  onSendPO: (id: string) => void;
  onReceiveStockClick: (poDetails: any) => void;
  onCancelPO: (id: string) => void;
}

export function PODetailDrawer({
  poDetails,
  onClose,
  token,
  onUpdatePaymentStatus,
  onDeletePO,
  onEditPO,
  onSendPO,
  onReceiveStockClick,
  onCancelPO,
}: PODetailDrawerProps) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-2xl border-4 border-outline rounded-lg shadow-hard-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b-4 border-black bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 border border-primary/20 text-primary rounded flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-display text-on-surface uppercase tracking-tight leading-none">
                {poDetails.orderCode}
              </h2>
              <span className="text-[9px] font-black text-on-surface-variant/60 uppercase tracking-widest">
                Supplier: <strong className="text-on-surface">{poDetails.supplierName}</strong>
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded bg-surface-container-highest text-on-surface hover:bg-error hover:text-white transition-colors shadow-hard border-2 border-outline"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info details */}
        <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-surface-container-low border-2 border-outline rounded-xl p-4 text-xs font-bold text-on-surface-variant">
            <div className="space-y-1">
              <span className="text-[8px] font-black text-on-surface-variant/50 uppercase tracking-widest">Order Date</span>
              <p className="text-on-surface">{format(new Date(poDetails.orderDate), "dd MMMM yyyy, HH:mm")}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[8px] font-black text-on-surface-variant/50 uppercase tracking-widest">Expected Delivery</span>
              <p className="text-on-surface">
                {poDetails.expectedDeliveryDate
                  ? format(new Date(poDetails.expectedDeliveryDate), "dd MMMM yyyy")
                  : "Not Scheduled"}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-[8px] font-black text-on-surface-variant/50 uppercase tracking-widest">Status / Payment</span>
              <div className="flex gap-2 items-center mt-1">
                <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-primary/10 text-primary border border-primary/20">
                  {poDetails.status}
                </span>
                <select
                  value={poDetails.paymentStatus}
                  onChange={async (e) => {
                    if (!token) return;
                    await onUpdatePaymentStatus(poDetails._id, e.target.value);
                  }}
                  className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 outline-none cursor-pointer h-[22px]"
                >
                  <option value="unpaid">unpaid</option>
                  <option value="partially_paid">partially paid</option>
                  <option value="paid">paid</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[8px] font-black text-on-surface-variant/50 uppercase tracking-widest">Order Total</span>
              <p className="text-base font-display text-on-surface">{formatCurrency(poDetails.totalAmount)}</p>
            </div>
          </div>

          {/* Notes */}
          {poDetails.notes && (
            <div className="space-y-2">
              <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Order Notes</span>
              <div className="bg-surface-container-high rounded p-3 text-xs italic font-bold border border-outline/50">
                "{poDetails.notes}"
              </div>
            </div>
          )}

          {/* Items List */}
          <div className="space-y-2">
            <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Fulfillment List</span>
            <div className="border-2 border-outline rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-container-high text-on-surface text-[9px] font-black uppercase tracking-wider border-b border-outline">
                    <th className="px-4 py-3">Ingredient</th>
                    <th className="px-4 py-3 text-right">Qty Ordered</th>
                    <th className="px-4 py-3 text-right">Qty Received</th>
                    <th className="px-4 py-3 text-right">Unit Cost</th>
                    <th className="px-4 py-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline/50">
                  {poDetails.items.map((item: any, index: number) => (
                    <tr key={index} className="text-xs font-bold text-on-surface-variant">
                      <td className="px-4 py-3 uppercase">{item.ingredientName}</td>
                      <td className="px-4 py-3 text-right">
                        {item.quantityOrdered} {item.ingredientUnit}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.quantityReceived} {item.ingredientUnit}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(item.unitCost)}</td>
                      <td className="px-4 py-3 text-right font-display text-on-surface">{formatCurrency(item.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-6 border-t-4 border-black bg-surface-container-low flex justify-between">
          <div>
            {poDetails.status === "draft" && (
              <button
                onClick={() => onDeletePO(poDetails)}
                className="px-4 py-2 bg-error/10 text-error border-2 border-black rounded font-display text-sm uppercase tracking-tighter hover:bg-error hover:text-white transition-all shadow-hard-sm"
              >
                <Trash2 className="w-4 h-4 inline mr-1.5" /> Delete PO
              </button>
            )}
          </div>
          <div className="flex gap-3">
            {poDetails.status === "draft" && (
              <>
                <button
                  onClick={() => onEditPO(poDetails)}
                  className="px-4 py-2 border-2 border-black rounded font-display text-sm uppercase tracking-tighter hover:bg-surface-container-high transition-all shadow-hard-sm"
                >
                  <Pencil className="w-4 h-4 inline mr-1.5" /> Edit PO
                </button>
                <button
                  onClick={() => onSendPO(poDetails._id)}
                  className="px-6 py-2 bg-black text-white rounded font-display text-sm uppercase tracking-tighter hover:bg-neutral-800 transition-all flex items-center gap-1.5 shadow-hard-sm"
                >
                  Send PO <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}
            {(poDetails.status === "sent" || poDetails.status === "partially_received") && (
              <>
                <button
                  onClick={() => onReceiveStockClick(poDetails)}
                  className="px-6 py-2 bg-emerald-600 text-white rounded font-display text-sm uppercase tracking-tighter hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-hard-sm"
                >
                  <CheckCircle className="w-4 h-4" /> Receive Stock
                </button>
                <button
                  onClick={() => onCancelPO(poDetails._id)}
                  className="px-4 py-2 bg-error/10 text-error border-2 border-black rounded font-display text-sm uppercase tracking-tighter hover:bg-error hover:text-white transition-all shadow-hard-sm"
                >
                  <XCircle className="w-4 h-4 inline mr-1.5" /> Cancel PO
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2 border-2 border-black rounded font-display text-sm uppercase tracking-tighter hover:bg-surface-container-high transition-all shadow-hard-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
