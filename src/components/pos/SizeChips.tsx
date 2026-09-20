"use client";

import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useToken } from "@/lib/useShop";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { PosContextSizeRow } from "./posContext";
import { useTranslation } from "@/contexts/LanguageContext";

export function SizeChips({ sizes }: { sizes: PosContextSizeRow[] }) {
  const { t } = useTranslation();
  const token = useToken();
  const confirmSize = useMutation(api.customers.confirmSizeProfile);

  if (sizes.length === 0) return null;

  const confirm = async (profileId: PosContextSizeRow["_id"]) => {
    try {
      await confirmSize({ token, profileId });
      toast.success(t("Size confirmed"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to confirm"));
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {sizes.map((s) => {
        const label = `${s.categoryName} ${s.sizeName}`;
        const confirmed = s.confidence === "CONFIRMADO";
        return (
          <button
            key={s._id}
            disabled={confirmed}
            onClick={() => confirm(s._id)}
            title={confirmed ? undefined : t("Tap to confirm")}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors",
              confirmed
                ? "bg-success/10 text-success border-success/30"
                : "bg-surface-container-low text-on-surface-variant border-outline border-dashed hover:border-primary/50"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
