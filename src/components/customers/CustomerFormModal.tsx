"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Modal, Button, Field, TextInput, Textarea, Select } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/contexts/LanguageContext";

export type CustomerFormExisting = {
  _id: Id<"customers">;
  name: string;
  phone1: string;
  phone2?: string;
  email?: string;
  address?: string;
  notes?: string;
};

/**
 * The one customer create/edit form — used by the CRM's `/customers` list
 * and the POS's "New customer" flow, so both places collect the same fields
 * instead of the POS having a stripped-down name/phone-only duplicate.
 *
 * Beyond the core identity fields, this also captures Tier 2 "conhecer o
 * cliente" preferences (categories of interest, colors) right on creation —
 * the cashier can still leave all of it blank, nothing here is required.
 * Sizes are deliberately NOT collected here: they're inferred automatically
 * from purchase history once the customer actually buys something (see
 * `convex/customerProfile.ts`), rather than typed in at signup.
 */
export function CustomerFormModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: CustomerFormExisting | null;
  onClose: () => void;
  onSaved?: (id: Id<"customers">) => void;
}) {
  const { t } = useTranslation();
  const token = useToken();
  const create = useMutation(api.customers.create);
  const update = useMutation(api.customers.update);
  const updateProfile = useMutation(api.customers.updateProfile);

  const categories = useQuery(api.categories.list, {});
  const colors = useQuery(api.colors.list, {});
  // Only fetched when editing, to prefill preferences already on file.
  const context = useQuery(
    api.customers.getPosContext,
    existing ? { customerId: existing._id } : "skip"
  );

  const [f, setF] = useState({
    name: existing?.name ?? "",
    phone1: existing?.phone1 ?? "",
    phone2: existing?.phone2 ?? "",
    email: existing?.email ?? "",
    address: existing?.address ?? "",
    notes: existing?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const [categoryIds, setCategoryIds] = useState<Id<"categories">[]>([]);
  const [colorIds, setColorIds] = useState<Id<"colors">[]>([]);
  const [colorSelectValue, setColorSelectValue] = useState("");

  // One-time seed of preference fields once the existing customer's
  // preferences load — not a controlled sync, so typing isn't clobbered by
  // the query's own reactivity.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!existing || !context?.customer || seeded) return;
    setCategoryIds(context.customer.preferredCategoryIds);
    setColorIds(context.customer.preferredColorIds);
    setSeeded(true);
  }, [existing, context, seeded]);

  const toggleCategory = (id: Id<"categories">) =>
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const addColorFromSelect = () => {
    if (!colorSelectValue) return;
    const id = colorSelectValue as Id<"colors">;
    if (!colorIds.includes(id)) setColorIds([...colorIds, id]);
    setColorSelectValue("");
  };

  const removeColor = (id: Id<"colors">) =>
    setColorIds((prev) => prev.filter((c) => c !== id));

  const save = async () => {
    if (!f.name.trim() || !f.phone1.trim())
      return toast.error(t("Name and phone are required."));
    setBusy(true);
    try {
      const payload = {
        token,
        name: f.name,
        phone1: f.phone1,
        phone2: f.phone2 || undefined,
        email: f.email || undefined,
        address: f.address || undefined,
        notes: f.notes || undefined,
      };
      let id: Id<"customers">;
      if (existing) {
        await update({ ...payload, id: existing._id });
        id = existing._id;
        toast.success(t("Customer updated"));
      } else {
        id = await create(payload);
        toast.success(t("Customer created"));
      }

      await updateProfile({
        token,
        id,
        preferredCategoryIds: categoryIds,
        preferredColorIds: colorIds,
      });

      onSaved?.(id);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={existing ? t("Edit Customer") : t("New Customer")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={save} loading={busy}>
            {t("Save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t("Full name")} required>
          <TextInput value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Phone")} required>
            <TextInput value={f.phone1} onChange={(e) => set("phone1", e.target.value)} />
          </Field>
          <Field label={t("Alt phone")}>
            <TextInput value={f.phone2} onChange={(e) => set("phone2", e.target.value)} />
          </Field>
        </div>
        <Field label={t("Email")}>
          <TextInput value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label={t("Address")}>
          <TextInput value={f.address} onChange={(e) => set("address", e.target.value)} />
        </Field>

        <div className="border-t border-outline/40 pt-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
            {t("Get to know the customer")} · {t("Optional")}
          </p>

          <div className="space-y-4">
            <Field label={t("Categories of interest")}>
              <div className="flex flex-wrap gap-1.5">
                {(categories ?? []).map((c) => (
                  <button
                    key={c._id}
                    type="button"
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
              <div className="flex flex-wrap gap-1.5 mb-2">
                {colorIds.map((id) => {
                  const c = (colors ?? []).find((x) => x._id === id);
                  if (!c) return null;
                  return (
                    <span
                      key={id}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/30"
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-outline/50"
                        style={{ background: c.hex || "transparent" }}
                      />
                      {c.name}
                      <button type="button" onClick={() => removeColor(id)}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Select
                  value={colorSelectValue}
                  onChange={(e) => setColorSelectValue(e.target.value)}
                  className="flex-1"
                >
                  <option value="">{t("Color…")}</option>
                  {(colors ?? [])
                    .filter((c) => !colorIds.includes(c._id))
                    .map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
                <Button type="button" variant="secondary" onClick={addColorFromSelect}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Field>
          </div>
        </div>

        <Field label={t("Notes")}>
          <Textarea
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
