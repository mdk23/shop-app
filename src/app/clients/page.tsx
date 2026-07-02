"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatCurrency, cn } from "@/lib/utils";
import { 
  Users, 
  Search, 
  Phone, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownRight,
  User,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Archive,
  ArchiveRestore
} from "lucide-react";
import { CustomerModal } from "@/components/CustomerModal";
import { CustomerHistory } from "@/components/CustomerHistory";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Id } from "../../../convex/_generated/dataModel";

const ITEMS_PER_PAGE = 8;

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [viewingHistoryId, setViewingHistoryId] = useState<Id<"customers"> | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const archiveCustomer = useMutation(api.customers.archive);
  const unarchiveCustomer = useMutation(api.customers.unarchive);

  const {
    results: paginatedList,
    status,
    loadMore,
  } = usePaginatedQuery(api.customers.listPaginated, { showArchived }, { initialNumItems: ITEMS_PER_PAGE });

  const searchResults = useQuery(api.customers.search, searchTerm ? { query: searchTerm, showArchived } : "skip");

  const displayCustomers = searchTerm ? (searchResults || []) : paginatedList;

  const handleArchive = (e: React.MouseEvent, customer: any) => {
    e.stopPropagation();

    if (customer.storeCreditBalance !== 0) {
      toast.error("Action Blocked", {
        description: "Cannot archive a client with an outstanding balance. Please settle debts or clear credits first.",
        duration: 6000,
      });
      return;
    }
    
    toast.warning(`Archive client ${customer.name}?`, {
      description: "Client will be hidden from the active list, but order history will be preserved.",
      action: {
        label: "Confirm",
        onClick: async () => {
          try {
            await archiveCustomer({ id: customer._id });
            toast.success("Client archived successfully");
          } catch (error: any) {
            toast.error(error.message || "Failed to archive client");
          }
        },
      },
      duration: 6000,
    });
  };

  const handleUnarchive = async (e: React.MouseEvent, customer: any) => {
    e.stopPropagation();
    try {
      await unarchiveCustomer({ id: customer._id });
      toast.success("Client restored successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to restore client");
    }
  };

  const handleEdit = (e: React.MouseEvent, customer: any) => {
    e.stopPropagation();
    setSelectedCustomer(customer);
    setIsModalOpen(true);
  };

  return (
    <PageLayout>
      <div className="space-y-12">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <h1 className="text-on-surface mb-2">Clients</h1>
            <p className="text-on-surface-variant font-black uppercase tracking-[0.3em] text-[10px] opacity-60 flex items-center gap-2">
              <Users className="w-4 h-4" /> Customer Database & Financial Ledger
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => {
                setShowArchived(!showArchived);
              }}
              className={cn(
                "px-6 py-4 rounded-lg font-display text-xl uppercase tracking-tighter border-4 border-black transition-all shadow-hard flex items-center justify-center gap-3",
                showArchived ? "bg-primary text-white" : "bg-surface text-on-surface hover:bg-surface-container-high"
              )}
            >
              <Archive className="w-6 h-6" strokeWidth={3} />
              {showArchived ? "Hide Archived" : "Show Archived"}
            </button>
            <button
              onClick={() => {
                setSelectedCustomer(null);
                setIsModalOpen(true);
              }}
              className="bg-brand-gradient text-white border-4 border-black px-8 py-4 rounded-lg font-display text-2xl uppercase tracking-tighter shadow-hard hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
            >
              <Plus className="w-8 h-8" strokeWidth={3} />
              Add New Client
            </button>
          </div>
        </div>

        <div className="bg-surface border-4 border-outline rounded-xl shadow-hard flex flex-col h-[calc(100vh-320px)] min-h-[500px] overflow-hidden">
          <div className="p-6 border-b-4 border-outline flex items-center gap-4 bg-surface-container-low/50">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Search by name or phone..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                }}
                className="w-full bg-surface-container-high border-2 border-outline rounded-lg pl-12 pr-4 py-3 outline-none focus:border-primary transition-all font-black uppercase tracking-wider text-[10px] shadow-hard-sm"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead className="sticky top-0 z-10">
                <tr className="bg-surface-container-highest text-on-surface">
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] border-b-4 border-outline">Client Name</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] border-b-4 border-outline">Contact Information</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] border-b-4 border-outline">Balance Summary</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] border-b-4 border-outline">Status</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-right border-b-4 border-outline">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-outline">
                {displayCustomers.map((customer) => (
                  <tr 
                    key={customer._id} 
                    className="hover:bg-primary/5 transition-all cursor-pointer group"
                    onClick={() => setViewingHistoryId(customer._id)}
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded bg-surface-container-high border-2 border-outline flex items-center justify-center shadow-hard-sm group-hover:bg-brand-gradient group-hover:text-white transition-all",
                          customer.isGeneric && "opacity-50"
                        )}>
                          {customer.isGeneric ? <Users className="w-6 h-6" /> : <User className="w-6 h-6" />}
                        </div>
                        <div>
                          <p className="font-display text-on-surface text-xl uppercase tracking-tighter">
                            {customer.name}
                            {customer.status === "archived" && (
                              <span className="ml-3 text-[10px] font-black uppercase tracking-widest bg-surface-container-highest px-2 py-0.5 rounded text-on-surface-variant opacity-60">
                                Archived
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest opacity-60">
                            ID: {customer._id.slice(-8).toUpperCase()}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[10px] font-black text-on-surface uppercase tracking-widest">
                          <Phone className="w-3.5 h-3.5 text-primary" /> {customer.phone1}
                        </div>
                        {(customer.phone2 || customer.phone3) && (
                          <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter italic opacity-60">
                            {customer.phone2} {customer.phone3 && `| ${customer.phone3}`}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded border-2 border-outline flex items-center justify-center",
                          customer.storeCreditBalance < 0 ? "bg-error text-on-error" : 
                          customer.storeCreditBalance > 0 ? "bg-green-700 text-white" : 
                          "bg-surface-container-high text-on-surface-variant"
                        )}>
                          <Wallet className="w-5 h-5" />
                        </div>
                        <div>
                          <p className={cn(
                            "text-2xl font-display",
                            customer.storeCreditBalance < 0 ? "text-error" : 
                            customer.storeCreditBalance > 0 ? "text-green-700" : 
                            "text-on-surface-variant"
                          )}>
                            {formatCurrency(Math.abs(customer.storeCreditBalance))}
                          </p>
                          <p className="text-[10px] font-black uppercase tracking-[0.1em] opacity-40">
                            {customer.storeCreditBalance < 0 ? "Outstanding Debt" : 
                             customer.storeCreditBalance > 0 ? "Account Credit" : "Balanced"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className={cn(
                        "inline-flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border-2",
                        customer.storeCreditBalance < 0 ? "bg-error/10 border-error text-error" : 
                        customer.storeCreditBalance > 0 ? "bg-green-700/10 border-green-700 text-green-700" : 
                        "bg-surface-container-low border-outline/10 text-on-surface-variant opacity-60"
                      )}>
                        {customer.storeCreditBalance < 0 ? <ArrowUpRight className="w-4 h-4" /> : 
                         customer.storeCreditBalance > 0 ? <ArrowDownRight className="w-4 h-4" /> : null}
                        {customer.storeCreditBalance < 0 ? "Unpaid" : 
                         customer.storeCreditBalance > 0 ? "Credit" : "Clean"}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleEdit(e, customer);
                          }}
                          className="p-2 rounded bg-surface border-2 border-outline text-on-surface hover:bg-surface-container-high transition-all shadow-hard-sm"
                          title="Edit Client"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {customer.status === "archived" ? (
                          <button
                            disabled={customer.isGeneric}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleUnarchive(e, customer);
                            }}
                            className="p-2 rounded bg-surface text-primary border-2 border-outline hover:bg-primary hover:text-white transition-all shadow-hard-sm disabled:opacity-20"
                            title="Restore Client"
                          >
                            <ArchiveRestore className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            disabled={customer.isGeneric}
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleArchive(e, customer);
                            }}
                            className="p-2 rounded bg-surface text-error border-2 border-outline hover:bg-error hover:text-on-error transition-all shadow-hard-sm disabled:opacity-20"
                            title="Archive Client"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {displayCustomers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center opacity-20">
                      <Users className="w-20 h-20 mx-auto mb-4" />
                      <p className="font-display text-2xl uppercase">No clients found</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!searchTerm && status === "CanLoadMore" && (
            <div className="p-6 border-t-4 border-black bg-surface-container-low flex items-center justify-center">
              <button
                onClick={() => loadMore(ITEMS_PER_PAGE)}
                className="px-6 py-3 bg-white border-4 border-black shadow-hard uppercase font-black text-[12px] hover:bg-surface-container-high transition-all active:scale-95"
              >
                Load More Clients
              </button>
            </div>
          )}
        </div>
      </div>

      <CustomerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialData={selectedCustomer}
      />

      <AnimatePresence>
        {viewingHistoryId && (
          <CustomerHistory
            customerId={viewingHistoryId}
            onClose={() => setViewingHistoryId(null)}
          />
        )}
      </AnimatePresence>
    </PageLayout>
  );
}
