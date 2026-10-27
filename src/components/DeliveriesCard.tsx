"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button, Card, Field, TextInput, Badge, Modal } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Truck, CheckCircle2, XCircle } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

const STATUS_TONE = { SCHEDULED: "info", DELIVERED: "success", FAILED: "error" } as const;
const STATUS_LABEL = { SCHEDULED: "Scheduled", DELIVERED: "Delivered", FAILED: "Failed" } as const;

/** A sale's deliveries, what is still to deliver, and scheduling / closing deliveries. */
export function DeliveriesCard({ saleId }: { saleId: Id<"sales"> }) {
  const { t } = useTranslation();
  const token = useToken();
  const data = useQuery(api.deliveries.forSale, { token, saleId });
  const create = useMutation(api.deliveries.create);
  const markDelivered = useMutation(api.deliveries.markDelivered);
  const markFailed = useMutation(api.deliveries.markFailed);

  const [open, setOpen] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [address, setAddress] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [failing, setFailing] = useState<Id<"deliveries"> | null>(null);
  const [failReason, setFailReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!data) return null;
  const left = data.lines.filter((l) => l.toDeliver > 0);

  const start = () => {
    setRecipientName(data.recipient?.name ?? "");
    setRecipientPhone(data.recipient?.phone ?? "");
    setAddress(data.recipient?.address ?? "");
    setQty(Object.fromEntries(left.map((l) => [l.saleItemId, l.toDeliver])));
    setOpen(true);
  };

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(t(success));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const schedule = async () => {
    const ok = await run(
      () =>
        create({
          token,
          saleId,
          recipientName,
          recipientPhone: recipientPhone || undefined,
          address,
          lines: Object.entries(qty)
            .filter(([, q]) => q > 0)
            .map(([saleItemId, quantity]) => ({ saleItemId: saleItemId as Id<"saleItems">, quantity })),
        }),
      "Delivery scheduled"
    );
    if (ok) setOpen(false);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Deliveries")}</p>
        {left.length > 0 && (
          <Button size="sm" variant="secondary" onClick={start}>
            <Truck className="w-3.5 h-3.5" /> {t("Schedule delivery")}
          </Button>
        )}
      </div>
      {data.deliveries.length === 0 ? (
        <p className="text-xs text-on-surface-variant">{t("No deliveries yet")}</p>
      ) : (
        <ul className="space-y-2">
          {data.deliveries.map((d) => (
            <li key={d._id} className="text-sm border-b border-outline/20 pb-2 last:border-0">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-mono">{d.deliveryNumber}</span> · {d.recipientName} · {d.address}
                </span>
                <Badge tone={STATUS_TONE[d.status]}>{t(STATUS_LABEL[d.status])}</Badge>
              </div>
              <p className="text-xs text-on-surface-variant">
                {d.items.map((i) => `${i.label} ×${i.quantity}`).join(", ")}
                {d.deliveredAt ? ` · ${t("delivered {date} to {name}", { date: formatDate(d.deliveredAt), name: d.receivedBy ?? "—" })}` : ""}
                {d.failureReason ? ` · ${d.failureReason}` : ""}
              </p>
              {d.status === "SCHEDULED" && (
                <div className="flex gap-1 mt-1">
                  <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => markDelivered({ token, id: d._id }), "Marked as delivered")}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> {t("Delivered")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setFailing(d._id)}>
                    <XCircle className="w-3.5 h-3.5" /> {t("Failed")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {left.length === 0 && data.deliveries.length > 0 && (
        <p className="text-xs text-success">{t("Everything on this sale is delivered or on its way.")}</p>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("Schedule delivery")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={schedule} loading={busy} disabled={!recipientName.trim() || !address.trim()}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("Recipient")} required>
            <TextInput value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
          </Field>
          <Field label={t("Phone")}>
            <TextInput value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
          </Field>
          <Field label={t("Address")} required>
            <TextInput value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label={t("Items")}>
            <div className="space-y-1">
              {left.map((l) => (
                <div key={l.saleItemId} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate">{l.label}</span>
                  <span className="text-on-surface-variant">{t("{count} left", { count: l.toDeliver })}</span>
                  <TextInput
                    type="number"
                    min={0}
                    max={l.toDeliver}
                    value={qty[l.saleItemId] ?? 0}
                    onChange={(e) => setQty((p) => ({ ...p, [l.saleItemId]: Number(e.target.value) }))}
                    className="w-20"
                    aria-label={t("Quantity")}
                  />
                </div>
              ))}
            </div>
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!failing}
        onClose={() => setFailing(null)}
        title={t("Delivery failed")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFailing(null)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!failReason.trim()}
              onClick={async () => {
                if (!failing) return;
                const ok = await run(() => markFailed({ token, id: failing, reason: failReason }), "Delivery marked as failed");
                if (ok) {
                  setFailing(null);
                  setFailReason("");
                }
              }}
            >
              {t("Mark failed")}
            </Button>
          </>
        }
      >
        <Field label={t("Reason")} required>
          <TextInput value={failReason} onChange={(e) => setFailReason(e.target.value)} />
        </Field>
        <p className="mt-2 text-xs text-on-surface-variant">{t("Its items can then go out on a new delivery.")}</p>
      </Modal>
    </Card>
  );
}
