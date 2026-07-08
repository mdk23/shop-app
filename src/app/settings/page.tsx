"use client";

import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Settings2, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function SettingsPage() {
  const settings = useQuery(api.settings.getAll);

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
