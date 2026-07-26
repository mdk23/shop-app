"use client";

import React, { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  Settings2,
  Loader2,
  Truck,
  Palette,
  Check,
  Store,
  Plus,
  Edit2,
  Globe,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useTheme, THEME_OPTIONS } from "@/contexts/ThemeContext";
import { BranchManagementModal } from "@/components/settings/BranchManagementModal";
import { toast } from "sonner";

export default function SettingsPage() {
  const settings = useQuery(api.settings.getAll);
  const branches = useQuery(api.branches.listAll);
  const upsertSetting = useMutation(api.settings.upsert);
  const ensureDefaultBranch = useMutation(api.branches.ensureDefaultBranch);

  const { theme, setTheme } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [branchToEdit, setBranchToEdit] = useState<any | null>(null);

  return (
    <PageLayout>
      <div className="max-w-5xl mx-auto space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-black text-on-surface tracking-tighter flex items-center gap-3">
            <Settings2 className="w-8 h-8 text-primary" />
            Global Settings
          </h1>
          <p className="text-on-surface-variant font-medium mt-2">
            Manage app-wide configurations, multi-branch store locations, delivery zones, and color themes.
          </p>
        </div>

        {/* Store Locations / Branches Configuration Card */}
        <div className="bg-surface border border-outline/30 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline/20 pb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                <Store className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-on-surface leading-tight">
                  Store Locations & Branches
                </h2>
                <p className="text-xs font-medium text-on-surface-variant/70 mt-1">
                  Manage inventory, staff, and sales across store branches from one master admin panel.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setBranchToEdit(null);
                setModalOpen(true);
              }}
              className="px-5 py-3 rounded-2xl bg-primary text-on-primary font-bold text-xs uppercase tracking-wider hover:bg-secondary transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer border border-primary/40"
            >
              <Plus className="w-4 h-4" />
              <span>Add Branch</span>
            </button>
          </div>

          {/* Branch List */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-on-surface uppercase tracking-wider">
                  Store Locations List ({branches?.length || 0})
                </h3>
                <p className="text-[11px] text-on-surface-variant font-medium">
                  Manage active store branches and default headquarters
                </p>
              </div>
            </div>

            {branches === undefined ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : branches.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-outline/30 rounded-2xl p-6 text-xs text-on-surface-variant font-bold uppercase tracking-wider">
                No store branches configured yet. Click "Add Branch" to get started.
              </div>
            ) : (
              <div className="border border-outline/30 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead className="bg-surface-container-low text-on-surface text-[10px] uppercase tracking-widest font-black border-b border-outline/20">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Store Name</th>
                      <th className="px-4 py-3">Address</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline/20 text-xs font-bold text-on-surface bg-surface">
                    {branches.map((b: any) => (
                      <tr key={b._id} className="hover:bg-surface-container/40 transition-colors">
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-surface-container-high border border-outline/30">
                            {b.code}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{b.name}</span>
                            {b.isDefault && (
                              <span className="px-2 py-0.5 rounded-full text-[8px] font-black bg-primary/10 text-primary border border-primary/20 uppercase tracking-widest">
                                Default
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-on-surface-variant font-medium text-[11px]">
                          {b.address || "---"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border",
                              b.status === "active"
                                ? "bg-primary/10 text-primary border-primary/20"
                                : "bg-surface-container-high text-on-surface-variant border-outline/30"
                            )}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setBranchToEdit(b);
                              setModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg border border-outline/30 hover:bg-surface-container text-on-surface-variant hover:text-primary transition-all cursor-pointer"
                            title="Edit Branch"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Theme Customization Section */}
        <div className="bg-surface border border-outline/30 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
              <Palette className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-on-surface leading-tight">
                App Theme & Color Palette
              </h2>
              <p className="text-xs font-bold text-on-surface-variant/70 uppercase tracking-widest">
                Select your preferred visual style
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {THEME_OPTIONS.map((opt) => {
              const isSelected = theme === opt.key;
              return (
                <div
                  key={opt.key}
                  onClick={() => setTheme(opt.key)}
                  className={cn(
                    "rounded-2xl border p-5 transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-outline/30 hover:border-outline bg-surface hover:bg-surface-container-low"
                  )}
                >
                  <div className="space-y-4">
                    {/* Swatch visual header */}
                    <div
                      className="h-24 rounded-xl p-3 flex flex-col justify-between border border-black/10 shadow-inner transition-transform group-hover:scale-[1.02]"
                      style={{ backgroundColor: opt.bgPreview }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-sm"
                          style={{ backgroundColor: opt.accent }}
                        >
                          {opt.key}
                        </span>
                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-lg border border-black/20 shadow"
                          style={{ backgroundColor: opt.primary }}
                          title={`Primary: ${opt.primary}`}
                        />
                        <div
                          className="w-7 h-7 rounded-lg border border-black/20 shadow"
                          style={{ backgroundColor: opt.accent }}
                          title={`Accent: ${opt.accent}`}
                        />
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-black text-on-surface group-hover:text-primary transition-colors">
                        {opt.name}
                      </h3>
                      <p className="text-xs text-on-surface-variant mt-1 leading-relaxed font-medium">
                        {opt.description}
                      </p>
                    </div>
                  </div>

                  <button
                    className={cn(
                      "mt-6 w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider border transition-all cursor-pointer shadow-sm",
                      isSelected
                        ? "bg-primary text-on-primary border-primary/40"
                        : "bg-surface text-on-surface border-outline/40 hover:bg-surface-container"
                    )}
                  >
                    {isSelected ? "Active Theme" : "Select Theme"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {settings === undefined ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Delivery Fees Configuration Card */}
            <div className="bg-surface border border-outline/30 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                    <Truck className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-on-surface leading-tight">Delivery Zones</h2>
                    <p className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">
                      Delivery Fees & Zones
                    </p>
                  </div>
                </div>
                <p className="text-sm text-on-surface-variant mb-6 font-medium leading-relaxed">
                  Configure delivery zone names and associated fee amounts. Admins and Managers can add new zones, adjust existing prices in MT, and toggle status.
                </p>
              </div>

              <div className="flex items-center justify-end">
                <Link
                  href="/settings/delivery-fees"
                  className="px-5 py-3 rounded-xl bg-surface border border-outline/30 hover:bg-surface-container font-bold text-xs uppercase tracking-wider text-on-surface hover:text-primary transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  Configure Zones
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Branch Management Modal */}
      <BranchManagementModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setBranchToEdit(null);
        }}
        branchToEdit={branchToEdit}
      />
    </PageLayout>
  );
}
