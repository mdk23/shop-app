"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button, TextInput, Field } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PosContext } from "@/components/pos/posContext";
import { useTranslation } from "@/contexts/LanguageContext";

// Common sport/use tags offered as one-tap suggestions — the field itself
// stays free text, this just speeds up the common cases.
const SUGGESTED_SPORTS = ["Corrida", "Futebol", "Ginásio", "Natação", "Casual"];

export function FichaPreferencias({
  customerId,
  context,
}: {
  customerId: Id<"customers">;
  context: PosContext;
}) {
  const { t } = useTranslation();
  const token = useToken();
  const colors = useQuery(api.colors.list, {});
  const categories = useQuery(api.categories.list, {});
  const updateProfile = useMutation(api.customers.updateProfile);
  const customer = context.customer;

  const [sports, setSports] = useState<string[]>(customer?.preferredSports ?? []);
  const [sportInput, setSportInput] = useState("");
  const [colorIds, setColorIds] = useState<Id<"colors">[]>(customer?.preferredColorIds ?? []);
  const [categoryIds, setCategoryIds] = useState<Id<"categories">[]>(
    customer?.preferredCategoryIds ?? []
  );
  const [brands, setBrands] = useState<string[]>(customer?.preferredBrands ?? []);
  const [brandInput, setBrandInput] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(customer?.whatsappOptIn ?? false);
  const [busy, setBusy] = useState(false);

  if (!customer) return null;

  const dirty =
    JSON.stringify(sports) !== JSON.stringify(customer.preferredSports) ||
    JSON.stringify(colorIds) !== JSON.stringify(customer.preferredColorIds) ||
    JSON.stringify(categoryIds) !== JSON.stringify(customer.preferredCategoryIds) ||
    JSON.stringify(brands) !== JSON.stringify(customer.preferredBrands) ||
    whatsappOptIn !== customer.whatsappOptIn;

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({
        token,
        id: customerId,
        preferredSports: sports,
        preferredColorIds: colorIds,
        preferredCategoryIds: categoryIds,
        preferredBrands: brands,
        whatsappOptIn,
      });
      toast.success(t("Preferences saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const addSport = (value?: string) => {
    const v = (value ?? sportInput).trim();
    if (!v || sports.includes(v)) return;
    setSports([...sports, v]);
    setSportInput("");
  };

  const addBrand = () => {
    const v = brandInput.trim();
    if (!v || brands.includes(v)) return;
    setBrands([...brands, v]);
    setBrandInput("");
  };

  const toggleColor = (id: Id<"colors">) =>
    setColorIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const toggleCategory = (id: Id<"categories">) =>
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const availableSuggestions = SUGGESTED_SPORTS.filter((s) => !sports.includes(s));

  return (
    <div className="space-y-4">
      <Field label={t("Categories of interest")}>
        <div className="flex flex-wrap gap-1.5">
          {(categories ?? []).map((c) => (
            <button
              key={c._id}
              onClick={() => toggleCategory(c._id)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors",
                categoryIds.includes(c._id)
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface border-outline text-on-surface-variant hover:border-primary/50"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t("Preferred colors")}>
        <div className="flex flex-wrap gap-1.5">
          {(colors ?? []).map((c) => (
            <button
              key={c._id}
              onClick={() => toggleColor(c._id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors",
                colorIds.includes(c._id)
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface border-outline text-on-surface-variant hover:border-primary/50"
              )}
            >
              <span
                className="w-3 h-3 rounded-full border border-outline/50"
                style={{ background: c.hex || "transparent" }}
              />
              {c.name}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t("Preferred brands")}>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {brands.map((b) => (
            <span
              key={b}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/30"
            >
              {b}
              <button onClick={() => setBrands(brands.filter((x) => x !== b))}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <TextInput
            value={brandInput}
            onChange={(e) => setBrandInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addBrand();
              }
            }}
            placeholder={t("e.g. Nike")}
          />
          <Button variant="secondary" onClick={addBrand}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </Field>

      <Field label={t("Preferred sports")}>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {sports.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/30"
            >
              {s}
              <button onClick={() => setSports(sports.filter((x) => x !== s))}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        {availableSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {availableSuggestions.map((s) => (
              <button
                key={s}
                onClick={() => addSport(s)}
                className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-dashed border-outline text-on-surface-variant hover:border-primary/50"
              >
                + {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <TextInput
            value={sportInput}
            onChange={(e) => setSportInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSport();
              }
            }}
            placeholder={t("e.g. Running")}
          />
          <Button variant="secondary" onClick={() => addSport()}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </Field>

      <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
        <input
          type="checkbox"
          checked={whatsappOptIn}
          onChange={(e) => setWhatsappOptIn(e.target.checked)}
        />
        {t("Send receipt via WhatsApp")}
      </label>

      {dirty && (
        <Button onClick={save} loading={busy}>
          {t("Save preferences")}
        </Button>
      )}
    </div>
  );
}
