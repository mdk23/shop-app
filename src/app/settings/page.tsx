"use client";

import { PageLayout } from "@/components/PageLayout";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Settings2, Loader2, Truck, Palette, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useTheme, THEME_OPTIONS } from "@/contexts/ThemeContext";

export default function SettingsPage() {
  const settings = useQuery(api.settings.getAll);
  const { theme, setTheme } = useTheme();

  return (
    <PageLayout>
      <div className="max-w-5xl mx-auto space-y-8 pb-12">
        <div>
          <h1 className="text-3xl font-black text-on-surface tracking-tighter flex items-center gap-3">
            <Settings2 className="w-8 h-8 text-primary" />
            Global Settings
          </h1>
          <p className="text-on-surface-variant font-medium mt-2">
            Manage app-wide configurations, delivery zones, and theme color schemes.
          </p>
        </div>

        {/* Theme Customization Section */}
        <div className="bg-surface-container-lowest border-2 border-outline rounded-3xl p-6 sm:p-8 shadow-hard space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border-2 border-outline">
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
                    "rounded-2xl border-2 p-5 transition-all cursor-pointer flex flex-col justify-between group relative overflow-hidden",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-hard"
                      : "border-outline/50 hover:border-outline bg-surface hover:bg-surface-container-low"
                  )}
                >
                  <div className="space-y-4">
                    {/* Swatch visual header */}
                    <div
                      className="h-24 rounded-xl p-3 flex flex-col justify-between border-2 border-black/10 shadow-inner transition-transform group-hover:scale-[1.02]"
                      style={{ backgroundColor: opt.bgPreview }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white shadow-sm"
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
                      "mt-6 w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-widest border-2 transition-all cursor-pointer",
                      isSelected
                        ? "bg-primary text-on-primary border-outline shadow-hard-sm"
                        : "bg-surface text-on-surface border-outline/60 group-hover:border-outline"
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
            <div className="bg-surface-container-lowest border-2 border-outline rounded-3xl p-6 shadow-hard flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary border-2 border-outline">
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
                  className="px-5 py-3 rounded-xl bg-surface border-2 border-outline hover:bg-surface-container-high font-black text-xs uppercase tracking-widest text-on-surface hover:text-primary transition-all flex items-center gap-2 cursor-pointer shadow-hard-sm"
                >
                  Configure Zones
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
