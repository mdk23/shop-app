"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Badge, Select, Button } from "@/components/ui";
import { SIZE_CONFIDENCE_TONE, SIZE_CONFIDENCE_LABEL } from "@/lib/badgeTones";
import { useToken } from "@/lib/useShop";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { PosContext } from "@/components/pos/posContext";
import { useTranslation } from "@/contexts/LanguageContext";

export function FichaTamanhos({
  customerId,
  context,
}: {
  customerId: Id<"customers">;
  context: PosContext;
}) {
  const { t } = useTranslation();
  const token = useToken();
  const categories = useQuery(api.categories.list, {});
  const sizesList = useQuery(api.sizes.list, {});
  const setSizeProfile = useMutation(api.customers.setSizeProfile);
  const removeSizeProfile = useMutation(api.customers.removeSizeProfile);

  const [categoryId, setCategoryId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!categoryId || !sizeId) return toast.error(t("Choose the category and size."));
    setBusy(true);
    try {
      await setSizeProfile({
        token,
        customerId,
        categoryId: categoryId as Id<"categories">,
        sizeId: sizeId as Id<"sizes">,
      });
      toast.success(t("Size saved"));
      setCategoryId("");
      setSizeId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (profileId: Id<"customerSizeProfiles">) => {
    try {
      await removeSizeProfile({ token, profileId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  return (
    <div className="space-y-3">
      {context.sizes.length === 0 ? (
        <p className="text-xs text-on-surface-variant">{t("No sizes registered yet.")}</p>
      ) : (
        <div className="space-y-1.5">
          {context.sizes.map((s) => (
            <div
              key={s._id}
              className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low border border-outline"
            >
              <div>
                <p className="text-sm font-bold">
                  {s.categoryName} — {s.sizeName}
                </p>
                <Badge tone={SIZE_CONFIDENCE_TONE[s.confidence]}>
                  {t(SIZE_CONFIDENCE_LABEL[s.confidence])}
                </Badge>
              </div>
              <button onClick={() => remove(s._id)} className="text-on-surface-variant hover:text-error">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Card className="p-3 bg-surface-container-low">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
          {t("Set/confirm size")}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-40">
            <option value="">{t("Category…")}</option>
            {(categories ?? []).map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select value={sizeId} onChange={(e) => setSizeId(e.target.value)} className="w-28">
            <option value="">{t("Size…")}</option>
            {(sizesList ?? []).map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={add} loading={busy}>
            {t("Save")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
