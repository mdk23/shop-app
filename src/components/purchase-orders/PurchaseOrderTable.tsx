"use client";

import React from "react";
import { format } from "date-fns";
import { Pencil, Trash2, ArrowRight, AlertCircle, FileText } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface PurchaseOrderTableProps {
  filteredPOs: any[];
  getSupplierName: (supplierId: string) => string;
  onSelectPO: (poId: string) => void;
  onEditDraft: (po: any) => void;
  onDeleteDraft: (po: any) => void;
  onSendDraft: (poId: string) => void;
  onCancelPO: (poId: string) => void;
}

export function PurchaseOrderTable({
  filteredPOs,
  getSupplierName,
  onSelectPO,
  onEditDraft,
  onDeleteDraft,
  onSendDraft,
  onCancelPO,
}: PurchaseOrderTableProps) {
  return (
    <div className="flex-1 overflow-auto">
      {filteredPOs.length === 0 ? (
        <div className="text-center py-24 text-on-surface-variant/40 font-black uppercase tracking-wider text-[10px]">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-35" />
          No purchase orders found
        </div>
      ) : (
        <table className="w-full text-left border-separate border-spacing-0">
          <thead>
            <tr className="bg-surface-container-highest text-on-surface text-[10px] font-black uppercase tracking-[0.2em] border-b-4 border-outline">
              <th className="px-8 py-5 border-b-4 border-outline">PO Code</th>
              <th className="px-8 py-5 border-b-4 border-outline">Supplier</th>
              <th className="px-8 py-5 border-b-4 border-outline">Order Date</th>
              <th className="px-8 py-5 border-b-4 border-outline">Expected Delivery</th>
              <th className="px-8 py-5 border-b-4 border-outline text-right">Total Amount</th>
              <th className="px-8 py-5 border-b-4 border-outline text-center">Status</th>
              <th className="px-8 py-5 border-b-4 border-outline text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPOs.map((po) => (
              <tr
                key={po._id}
                onClick={() => onSelectPO(po._id)}
                className="hover:bg-surface-container-low transition-colors cursor-pointer group text-xs font-bold text-on-surface-variant"
              >
                <td className="px-8 py-5 border-b border-outline/50 font-display text-base text-on-surface group-hover:text-primary transition-colors">
                  {po.orderCode}
                </td>
                <td className="px-8 py-5 border-b border-outline/50 uppercase">
                  {getSupplierName(po.supplierId)}
                </td>
                <td className="px-8 py-5 border-b border-outline/50">
                  {format(new Date(po.orderDate), "dd/MM/yyyy HH:mm")}
                </td>
                <td className="px-8 py-5 border-b border-outline/50">
                  {po.expectedDeliveryDate
                    ? format(new Date(po.expectedDeliveryDate), "dd/MM/yyyy")
                    : "—"}
                </td>
                <td className="px-8 py-5 border-b border-outline/50 text-right font-display text-sm text-on-surface">
                  {formatCurrency(po.totalAmount)}
                </td>
                <td className="px-8 py-5 border-b border-outline/50 text-center">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                      po.status === "draft" && "bg-gray-500/10 text-gray-600 border border-gray-500/20",
                      po.status === "sent" && "bg-orange-500/10 text-orange-600 border border-orange-500/20",
                      (po.status === "completed" || po.status === "partially_received") &&
                        "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
                      po.status === "cancelled" && "bg-error/10 text-error border border-error/20"
                    )}
                  >
                    {po.status === "partially_received" ? "partially received" : po.status}
                  </span>
                </td>
                <td className="px-8 py-5 border-b border-outline/50 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-3">
                    {po.status === "draft" && (
                      <>
                        <button
                          onClick={() => onEditDraft(po)}
                          className="p-2 border border-black rounded hover:bg-surface-container-high active:bg-surface-container-highest transition-all shadow-hard-sm"
                          title="Edit Draft"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteDraft(po)}
                          className="p-2 bg-error/10 text-error border border-black rounded hover:bg-error hover:text-white transition-all shadow-hard-sm"
                          title="Delete Draft"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onSendDraft(po._id)}
                          className="px-3 py-1.5 bg-black text-white rounded font-display text-[10px] uppercase tracking-wider hover:bg-neutral-800 transition-all flex items-center gap-1.5 shadow-hard-sm"
                        >
                          Send <ArrowRight className="w-3 h-3" />
                        </button>
                      </>
                    )}
                    {po.status === "sent" && (
                      <button
                        onClick={() => onCancelPO(po._id)}
                        className="px-3 py-1.5 bg-error/10 text-error border border-black rounded font-display text-[10px] uppercase tracking-wider hover:bg-error hover:text-white transition-all shadow-hard-sm"
                      >
                        Cancel PO
                      </button>
                    )}
                    {po.status === "cancelled" && (
                      <button
                        onClick={() => onDeleteDraft(po)}
                        className="p-2 bg-error/10 text-error border border-black rounded hover:bg-error hover:text-white transition-all shadow-hard-sm"
                        title="Delete Cancelled PO"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
