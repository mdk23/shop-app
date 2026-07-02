"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Receipt, X, Truck, Printer } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';

// Helper payment methods display
export const getMethodLabel = (method: string): string => {
  const labels: Record<string, string> = {
    cash: 'Dinheiro',
    credit_card: 'Cartão Crédito',
    debit_card: 'Cartão Débito',
    pix: 'PIX',
    mpesa: 'M-Pesa',
    emola: 'E-Mola',
    emola_pai: 'Emola Pai',
    bci: 'BCI',
    bim: 'BIM',
    conta_movel: 'Conta Móvel',
    store_credit: 'Crédito Loja',
    'Cash': 'Dinheiro',
    'M-Pesa': 'M-Pesa',
    'E-Mola': 'E-Mola',
    'Emola Pai': 'Emola Pai',
    'BCI': 'BCI',
    'BIM': 'BIM',
    'Conta Movel': 'Conta Móvel',
    'Store Credit': 'Crédito Loja'
  };

  const lookup = method ? method.toString().toLowerCase() : '';
  return labels[lookup] || labels[method] || method || 'Outro';
};

export const getStatusBadge = (status: string) => {
  const configs: Record<string, { bg: string; text: string; label: string }> = {
    paid: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30', text: 'text-emerald-700', label: 'Pago' },
    partially_paid: { bg: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30', text: 'text-amber-700', label: 'Parcial' },
    pending: { bg: 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900/30', text: 'text-orange-700', label: 'Pendente' },
    unpaid: { bg: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30', text: 'text-red-700', label: 'Dívida' },
    cancelled: { bg: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700/30', text: 'text-gray-750', label: 'Cancelado' },

    // DB values mappings
    'Paid': { bg: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30', text: 'text-emerald-700', label: 'Pago' },
    'Partially Paid': { bg: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30', text: 'text-amber-700', label: 'Parcial' },
    'Pending': { bg: 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900/30', text: 'text-orange-700', label: 'Pendente' },
    'Unpaid': { bg: 'bg-red-50 text-red-700 border-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30', text: 'text-red-700', label: 'Dívida' },
    'Cancelled': { bg: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700/30', text: 'text-gray-750', label: 'Cancelado' },
    'New': { bg: 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/30', text: 'text-blue-700', label: 'Novo' },
    'Confirmed': { bg: 'bg-indigo-50 text-indigo-700 border-indigo-100 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/30', text: 'text-indigo-700', label: 'Confirmado' },
    'Preparing': { bg: 'bg-yellow-50 text-yellow-700 border-yellow-100 dark:bg-yellow-950/20 dark:text-yellow-400 dark:border-yellow-900/30', text: 'text-yellow-700', label: 'Preparando' },
    'Ready': { bg: 'bg-teal-50 text-teal-700 border-teal-100 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-900/30', text: 'text-teal-700', label: 'Pronto' },
    'In Transit': { bg: 'bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-900/30', text: 'text-orange-700', label: 'Em Trânsito' },
    'Delivered': { bg: 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30', text: 'text-emerald-700', label: 'Entregue' },
    'Picked Up': { bg: 'bg-green-50 text-green-700 border-green-100 dark:bg-green-950/20 dark:text-green-400 dark:border-green-900/30', text: 'text-green-700', label: 'Retirado' }
  };

  const lookup = status || 'Pending';
  const config = configs[lookup] || { bg: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-700/30', text: 'text-gray-700', label: String(status).toUpperCase() };

  return (
    <span className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold uppercase tracking-wider ${config.bg}`}>
      {config.label}
    </span>
  );
};

// Print Portal Wrapper to render directly as child of body (bypassing nested NextJS layout structures)
function PrintPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let root = document.getElementById('print-portal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'print-portal-root';
      document.body.appendChild(root);
    }
    setPortalRoot(root);
    setMounted(true);

    return () => {
      // Clean up root if it becomes empty
      if (root && root.parentNode && root.childNodes.length === 0) {
        root.parentNode.removeChild(root);
      }
    };
  }, []);

  if (!mounted || !portalRoot) return null;

  return createPortal(children, portalRoot);
}

// Inline Print CSS Injector Component
function PrintStyles() {
  return (
    <style dangerouslySetInnerHTML={{
      __html: `
      @media print {
        @page {
          margin: 0 !important;
        }

        /* Hide everything directly under body except the portal root */
        body > *:not(#print-portal-root) {
          display: none !important;
        }
        
        /* Ensure normal background scroll and width boundaries for body */
        html, body {
          background: white !important;
          color: black !important;
          height: auto !important;
          overflow: visible !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        #print-portal-root {
          display: block !important;
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
        }

        #print-root {
          position: relative !important;
          background: white !important;
          height: auto !important;
          min-height: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        
        .print-receipt-modal {
          position: relative !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          border: none !important;
          box-shadow: none !important;
          background: white !important;
          color: black !important;
        }
        
        .print-receipt-thermal {
          width: 80mm !important; /* POS Paper Width */
          margin: 0 auto !important;
          padding-top: 0 !important;
          padding-left: 20px !important;
          padding-right: 20px !important;
          padding-bottom: 20px !important; /* Exactly 20px (0.5cm) space below the content */
          box-sizing: border-box !important;
        }
        
        /* Hide screen-only interactive components */
        .print\\:hidden, button, header, nav, aside {
          display: none !important;
        }
      }
    `}} />
  );
}


/* ==========================================================================
   2. THERMAL RECEIPT MODAL
   ========================================================================== */
interface ThermalReceiptModalProps {
  order: any;
  onClose: () => void;
  isKitchenTicket?: boolean;
}

export function ThermalReceiptModal({ order, onClose, isKitchenTicket = false }: ThermalReceiptModalProps) {
  const [isKitchen, setIsKitchen] = useState(isKitchenTicket);
  const clientName = order.customerName || order.customer?.name || 'Cliente Avulso/Balcão';
  const orderNum = order.orderCode || `#${order._id ? order._id.slice(-6).toUpperCase() : order.id}`;
  const status = order.status || order.orderStatus || 'Pending';
  const orderType = (order.orderType || 'dine_in').toLowerCase();

  const deliveryFee = order.deliveryFeeAmount || 0;
  const items = order.items || [];

  const subtotal = order.total - deliveryFee;
  const total = order.total || 0;
  const discount = order.discount || 0;

  const paidAmount = order.amountPaid ?? (status === 'Paid' || status === 'paid' ? total : 0);
  const remainingBalance = order.remainingAmount ?? Math.max(0, total - paidAmount);

  const handlePrint = () => {
    window.print();
  };

  return (
    <PrintPortal>
      <div id="print-root" className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[120] p-4 print:p-0 print:bg-white print:relative print:z-auto print:block">
        <PrintStyles />
        <div className="print-receipt-modal print-receipt-thermal bg-white rounded-3xl w-full max-w-sm p-6 border-2 border-outline shadow-hard-lg space-y-4 relative overflow-hidden print:shadow-none print:border-none print:w-full print:p-0 print:space-y-2 text-black">

          {/* Soft background striping layout of genuine POS ticket */}
          <div className="text-center pb-2 border-b border-dashed border-gray-300">
            <h4 className="font-mono font-black text-base text-black tracking-widest uppercase mt-1">OLYMPIA CHICKEN</h4>
            <p className="text-[9px] text-gray-400 font-bold tracking-widest mt-0.5 uppercase mb-2">
              {isKitchen ? "TALAO DE COZINHA" : "Comprovativo do Cliente"}
            </p>

            {/* Tab Selector - Screen Only */}
            <div className="flex rounded-xl bg-gray-100 p-0.5 print:hidden max-w-[200px] mx-auto border border-gray-200">
              <button
                onClick={() => setIsKitchen(false)}
                className={cn(
                  "flex-1 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                  !isKitchen ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                Receipt
              </button>
              <button
                onClick={() => setIsKitchen(true)}
                className={cn(
                  "flex-1 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                  isKitchen ? "bg-white text-black shadow-sm" : "text-gray-400 hover:text-gray-600"
                )}
              >
                🍗 Kitchen
              </button>
            </div>
          </div>

          <div className="space-y-1.5 text-[10px] font-mono leading-relaxed text-gray-700">
            <div className="flex justify-between">
              <span>Ordem:</span>
              <span className="font-bold text-black">{orderNum}</span>
            </div>
            <div className="flex justify-between">
              <span>Data:</span>
              <span>{new Date(order.createdAt).toLocaleString('pt-BR')}</span>
            </div>
            <div className="flex justify-between">
              <span>Canal/Tipo:</span>
              <span className="uppercase font-bold text-black">{orderType}</span>
            </div>
            <div className="flex justify-between">
              <span>Cliente:</span>
              <span className="font-bold text-black uppercase">{clientName}</span>
            </div>
            {order.username && (
              <div className="flex justify-between">
                <span>Vendedor:</span>
                <span className="font-semibold">@{order.username}</span>
              </div>
            )}

            {/* Items Table lists */}
            <div className="border-t border-b border-dashed border-gray-200 py-2 my-2.5 space-y-1.5 font-sans">
              {items.map((it: any, idx: number) => {
                const itemPrice = it.priceAtTime ?? it.price ?? 0;
                return (
                  <div key={idx} className="space-y-0.5 text-black">
                    <div className="flex justify-between items-start gap-2">
                      <span className="flex-1 truncate uppercase font-bold text-[10px]">{it.quantity}x {it.dishName || it.name || it.itemName || 'Item'}</span>
                      {!isKitchen && (
                        <span className="font-mono font-bold shrink-0">{formatCurrency(itemPrice * it.quantity)}</span>
                      )}
                    </div>
                    {it.modifiers && it.modifiers.map((mod: any, i: number) => (
                      <div key={i} className="flex justify-between text-[9px] text-gray-500 pl-2">
                        <span>🍳 +{mod.name}</span>
                        {!isKitchen && <span>+{formatCurrency(mod.price)}</span>}
                      </div>
                    ))}
                    {it.comboSelections && it.comboSelections.map((sel: any, i: number) => (
                      <div key={i} className="flex justify-between text-[9px] text-gray-500 pl-2">
                        <span>🥗 +{sel.name} ({sel.category})</span>
                        {!isKitchen && sel.extraCharge > 0 && <span>+{formatCurrency(sel.extraCharge)}</span>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Calculations lists */}
            {!isKitchen ? (
              <div className="space-y-1 pt-1 text-right text-gray-700">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {deliveryFee > 0 && (
                  <div className="flex justify-between">
                    <span>(+) Taxa Delivery:</span>
                    <span>{formatCurrency(deliveryFee)}</span>
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex justify-between text-red-600 font-bold">
                    <span>(-) Desconto:</span>
                    <span>{formatCurrency(discount)}</span>
                  </div>
                )}
                {/* Total lists */}
                <div className="flex justify-between text-xs font-bold text-black border-t border-black pt-2.5 mt-2">
                  <span>TOTAL DA COMPRA</span>
                  <span className="text-primary text-sm block font-mono">{formatCurrency(total)}</span>
                </div>

                <div className="flex justify-between text-[11px] font-bold text-gray-600">
                  <span>Valor Pago:</span>
                  <span>{formatCurrency(paidAmount)}</span>
                </div>

                <div className="flex justify-between text-[11px] font-bold text-gray-600">
                  <span>Valor em Dívida:</span>
                  <span className={remainingBalance > 0 ? "text-red-600" : ""}>{formatCurrency(remainingBalance)}</span>
                </div>

                {/* Split payment logs in POS */}
                {order.splitPayments && order.splitPayments.length > 0 && (
                  <div className="border-t border-dashed border-gray-200 mt-2 pt-2 text-[9px] text-left space-y-0.5 text-gray-500 font-sans">
                    <span className="font-bold uppercase tracking-wider block text-[8px]">Métodos de Pagamento:</span>
                    {order.splitPayments.map((p: any, i: number) => (
                      <div key={i} className="flex justify-between">
                        <span>• {getMethodLabel(p.method)}</span>
                        <span className="font-mono font-bold text-black">{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Status print */}
                <div className="pt-2 text-center text-xs font-bold uppercase tracking-widest text-primary border-t border-dashed border-gray-300 mt-3">
                  *** {orderType === 'delivery' ? 'PRONTO PARA DESPACHO' : 'ENTREGUE AO CLIENTE'} ***
                </div>
              </div>
            ) : (
              <div className="pt-2 text-center text-xs font-bold uppercase tracking-widest text-primary border-t border-dashed border-gray-300 mt-3">
                *** TALAO DE COZINHA ***
              </div>
            )}
          </div>

          {/* Buttons - Hidden in Print */}
          <div className="flex flex-col gap-2 pt-2 print:hidden">
            <button
              onClick={handlePrint}
              className="w-full py-3 bg-primary text-on-primary font-black text-xs uppercase tracking-wider rounded-xl hover:bg-secondary transition-colors cursor-pointer flex items-center justify-center gap-1.5 border-2 border-outline shadow-hard-sm"
            >
              <Printer size={14} /> Imprimir Extrato
            </button>

            <button
              onClick={onClose}
              className="w-full py-2.5 bg-surface text-on-surface font-black text-xs uppercase tracking-wider rounded-xl hover:bg-surface-container-high transition-colors cursor-pointer border-2 border-outline shadow-hard-sm"
            >
              Concluir Operação
            </button>
          </div>
        </div>
      </div>
    </PrintPortal>
  );
}
