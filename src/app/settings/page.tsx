"use client";

import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Settings2, Pizza, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function SettingsPage() {
  const settings = useQuery(api.settings.getAll);
  const upsertSetting = useMutation(api.settings.upsert);
  const initializePromoDish = useMutation(api.settings.initializePromoDish);

  const pizzaPromoSetting = settings?.find((s) => s.key === "pizzaPromo");
  const isPromoActive = pizzaPromoSetting?.isActive ?? false;

  const handleTogglePromo = async () => {
    try {
      // First ensure the promo dish exists and is configured
      await initializePromoDish();
      
      // Then toggle the state
      const newState = !isPromoActive;
      await upsertSetting({
        key: "pizzaPromo",
        isActive: newState,
        label: "2 Pizzas for 1000 MT",
      });

      toast.success(`Pizza Promo is now ${newState ? "ACTIVE" : "INACTIVE"}`, {
        position: "bottom-center",
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to update settings");
    }
  };

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-black text-on-surface tracking-tighter flex items-center gap-3">
            <Settings2 className="w-8 h-8 text-primary" />
            Global Settings
          </h1>
          <p className="text-on-surface-variant font-medium mt-2">
            Manage app-wide configurations and promotions.
          </p>
        </div>

        {settings === undefined ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Pizza Promo Settings Card */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 shadow-soft flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    <Pizza className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-on-surface leading-tight">Pizza Promo</h2>
                    <p className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">
                      2 Pizzas for 1000 MT
                    </p>
                  </div>
                </div>
                <p className="text-sm text-on-surface-variant mb-6 font-medium leading-relaxed">
                  Enables a dedicated button on the POS page. Customers can select any 2 pizzas for a fixed price of 1000 MT. The same pizza can be selected twice. Inventory is deducted correctly for both items.
                </p>
              </div>

              <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-2xl border border-outline-variant">
                <span className="font-black text-on-surface-variant text-sm uppercase tracking-widest">
                  Status: {isPromoActive ? <span className="text-primary">Active</span> : <span className="text-on-surface-variant/50">Inactive</span>}
                </span>
                
                <button
                  onClick={handleTogglePromo}
                  className={cn(
                    "relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                    isPromoActive
                      ? "bg-primary border-primary"
                      : "bg-surface-container-highest border-outline-variant"
                  )}
                >
                  <span className="sr-only">Toggle Pizza Promo</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      isPromoActive ? "translate-x-3" : "-translate-x-3"
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Delivery Fees Configuration Card */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 shadow-soft flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
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
