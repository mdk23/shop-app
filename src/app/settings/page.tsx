"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import Link from "next/link";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Button,
  Field,
  TextInput,
  Modal,
  Table,
  Th,
  Td,
  Badge,
  Spinner,
  Pagination,
} from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { useClientPage } from "@/lib/pagination";
import { useTheme, THEME_OPTIONS } from "@/contexts/ThemeContext";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Check, Plus, Pencil, FileClock, Truck, Ruler, Palette } from "lucide-react";

const LANGUAGE_OPTIONS: { code: "pt" | "en"; name: string }[] = [
  { code: "pt", name: "Português" },
  { code: "en", name: "English" },
];

const TOGGLE_KEYS = [
  "allowNegativeStock",
  "customerCreditEnabled",
  "returnsEnabled",
  "multiBranchEnabled",
  "lowStockAlertsEnabled",
];

const VALUE_KEYS = [
  "businessName",
  "businessPhone",
  "businessAddress",
  "receiptFooter",
  "currencySymbol",
  "taxRatePercent",
  "discountMaxPercentWithoutApproval",
];

export default function SettingsPage() {
  const token = useToken();
  const settings = useQuery(api.settings.getAll, {});
  const branches = useQuery(api.branches.listAll, {});
  const branchesPage = useClientPage(branches ?? []);
  const upsert = useMutation(api.settings.upsert);
  const initDefaults = useMutation(api.settings.initializeDefaults);
  const { theme, setTheme } = useTheme();
  const { language, t } = useTranslation();
  const [savingLanguage, setSavingLanguage] = useState(false);

  const get = (key: string) => settings?.find((s) => s.key === key);

  const setLanguage = async (code: "pt" | "en") => {
    setSavingLanguage(true);
    try {
      await upsert({ token, key: "language", isActive: true, value: code });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setSavingLanguage(false);
    }
  };

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const saveValue = async (key: string) => {
    const s = get(key);
    setSavingKey(key);
    try {
      await upsert({
        token,
        key,
        isActive: s?.isActive ?? true,
        value: drafts[key] ?? s?.value ?? "",
        label: s?.label,
      });
      toast.success(t("Saved"));
      setDrafts((p) => {
        const n = { ...p };
        delete n[key];
        return n;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setSavingKey(null);
    }
  };

  const toggle = async (key: string) => {
    const s = get(key);
    try {
      await upsert({
        token,
        key,
        isActive: !(s?.isActive ?? false),
        value: s?.value,
        label: s?.label,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  const [branchModal, setBranchModal] = useState<
    null | { _id?: Id<"branches">; name: string; code: string; address: string; phone: string; isDefault: boolean }
  >(null);

  return (
    <PageLayout title={t("Settings")} subtitle={t("Business configuration")}>
      <div className="flex flex-wrap gap-2 mb-4">
        <Link href="/settings/sizes">
          <Button variant="secondary">
            <Ruler className="w-3.5 h-3.5" /> {t("Sizes")}
          </Button>
        </Link>
        <Link href="/settings/colors">
          <Button variant="secondary">
            <Palette className="w-3.5 h-3.5" /> {t("Colors")}
          </Button>
        </Link>
        <Link href="/settings/audit-logs">
          <Button variant="secondary">
            <FileClock className="w-3.5 h-3.5" /> {t("Audit Logs")}
          </Button>
        </Link>
        <Link href="/settings/delivery-fees">
          <Button variant="secondary">
            <Truck className="w-3.5 h-3.5" /> {t("Delivery Fees")}
          </Button>
        </Link>
        <div className="ml-auto" />
        <Button
          variant="ghost"
          onClick={async () => {
            await initDefaults({ token });
            toast.success(t("Defaults ensured"));
          }}
        >
          {t("Restore missing defaults")}
        </Button>
      </div>

      {settings === undefined ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="text-sm font-black uppercase tracking-wider mb-3">{t("Business")}</h3>
            <div className="space-y-3">
              {VALUE_KEYS.map((key) => {
                const s = get(key);
                const val = drafts[key] ?? s?.value ?? "";
                return (
                  <Field key={key} label={s?.label ?? key}>
                    <div className="flex gap-2">
                      <TextInput
                        value={val}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [key]: e.target.value }))
                        }
                      />
                      {drafts[key] !== undefined && (
                        <Button
                          size="sm"
                          onClick={() => saveValue(key)}
                          loading={savingKey === key}
                        >
                          {t("Save")}
                        </Button>
                      )}
                    </div>
                  </Field>
                );
              })}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-black uppercase tracking-wider mb-3">{t("Features")}</h3>
            <div className="space-y-2">
              {TOGGLE_KEYS.map((key) => {
                const s = get(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggle(key)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-container-low border border-outline text-left"
                  >
                    <span className="text-xs font-bold">{s?.label ?? key}</span>
                    <Badge tone={s?.isActive ? "success" : "neutral"}>
                      {s?.isActive ? t("On") : t("Off")}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black uppercase tracking-wider">{t("Branches")}</h3>
              <Button
                size="sm"
                onClick={() =>
                  setBranchModal({
                    name: "",
                    code: "",
                    address: "",
                    phone: "",
                    isDefault: false,
                  })
                }
              >
                <Plus className="w-3.5 h-3.5" /> {t("Add")}
              </Button>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>{t("Name")}</Th>
                  <Th>{t("Code")}</Th>
                  <Th>{t("Address")}</Th>
                  <Th>{t("Status")}</Th>
                  <Th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {branchesPage.rows.map((b) => (
                  <tr key={b._id}>
                    <Td className="font-bold">
                      {b.name}
                      {b.isDefault && <Badge tone="info"> {t("default")}</Badge>}
                    </Td>
                    <Td className="font-mono text-xs">{b.code}</Td>
                    <Td className="text-on-surface-variant">{b.address ?? "—"}</Td>
                    <Td>
                      <Badge tone={b.status === "active" ? "success" : "neutral"}>
                        {t(b.status === "active" ? "Active" : "Inactive")}
                      </Badge>
                    </Td>
                    <Td>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setBranchModal({
                            _id: b._id,
                            name: b.name,
                            code: b.code,
                            address: b.address ?? "",
                            phone: b.phone ?? "",
                            isDefault: !!b.isDefault,
                          })
                        }
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {branches && branches.length > 0 && (
              <Pagination
                pageIndex={branchesPage.pageIndex}
                rowCount={branchesPage.rows.length}
                pageSize={branchesPage.pageSize}
                hasPrev={branchesPage.hasPrev}
                hasNext={branchesPage.hasNext}
                onPrev={branchesPage.goPrev}
                onNext={branchesPage.goNext}
              />
            )}
          </Card>

          <Card className="p-4 lg:col-span-2">
            <h3 className="text-sm font-black uppercase tracking-wider mb-3">{t("Theme")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTheme(t.key)}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-colors",
                    theme === t.key
                      ? "border-primary bg-primary/5"
                      : "border-outline hover:border-primary/50"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-4 h-4 rounded-full border border-outline"
                      style={{ background: t.primary }}
                    />
                    <span className="text-xs font-black uppercase tracking-wider">
                      {t.name}
                    </span>
                    {theme === t.key && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                  </div>
                  <p className="text-[10px] text-on-surface-variant">{t.description}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4 lg:col-span-2">
            <h3 className="text-sm font-black uppercase tracking-wider mb-3">{t("Language")}</h3>
            <div className="grid grid-cols-2 gap-3">
              {LANGUAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  disabled={savingLanguage}
                  onClick={() => setLanguage(opt.code)}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-colors disabled:opacity-50",
                    language === opt.code
                      ? "border-primary bg-primary/5"
                      : "border-outline hover:border-primary/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider">
                      {opt.name}
                    </span>
                    {language === opt.code && (
                      <Check className="w-3.5 h-3.5 text-primary ml-auto" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {branchModal && (
        <BranchModal
          token={token}
          data={branchModal}
          onClose={() => setBranchModal(null)}
        />
      )}
    </PageLayout>
  );
}

function BranchModal({
  token,
  data,
  onClose,
}: {
  token: string;
  data: {
    _id?: Id<"branches">;
    name: string;
    code: string;
    address: string;
    phone: string;
    isDefault: boolean;
  };
  onClose: () => void;
}) {
  const create = useMutation(api.branches.create);
  const update = useMutation(api.branches.update);
  const { t } = useTranslation();
  const [f, setF] = useState(data);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) =>
    setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim() || !f.code.trim()) return toast.error(t("Name and code required."));
    setBusy(true);
    try {
      if (f._id) {
        await update({
          token,
          id: f._id,
          name: f.name,
          code: f.code,
          address: f.address || undefined,
          phone: f.phone || undefined,
          isDefault: f.isDefault,
        });
      } else {
        await create({
          token,
          name: f.name,
          code: f.code,
          address: f.address || undefined,
          phone: f.phone || undefined,
          isDefault: f.isDefault,
        });
      }
      toast.success(t("Saved"));
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
      size="sm"
      title={f._id ? t("Edit Branch") : t("New Branch")}
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
      <Field label={t("Name")} required>
        <TextInput value={f.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label={t("Code")} required>
        <TextInput value={f.code} onChange={(e) => set("code", e.target.value)} />
      </Field>
      <Field label={t("Address")}>
        <TextInput value={f.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <Field label={t("Phone")}>
        <TextInput value={f.phone} onChange={(e) => set("phone", e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-xs font-bold">
        <input
          type="checkbox"
          checked={f.isDefault}
          onChange={(e) => set("isDefault", e.target.checked)}
        />
        {t("Default branch")}
      </label>
    </Modal>
  );
}
