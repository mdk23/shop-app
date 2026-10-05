"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Modal, Button, Table, Th, Td, TextInput, Spinner, Badge } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

/**
 * Destination counts what actually arrived. Anything less than was sent is recorded
 * as a shortage on the receipt; the stock moved is the observed quantity.
 */
export function TransferReceiveModal({
  transferId,
  onClose,
  onDone,
}: {
  transferId: Id<"stockTransfers">;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const token = useToken();
  const transfer = useQuery(api.stockTransfers.get, { id: transferId });
  const receive = useMutation(api.stockTransfers.receive);
  const [observed, setObserved] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!transfer) return;
    setObserved(
      Object.fromEntries(transfer.items.map((i) => [i.productVariantId, i.quantity]))
    );
  }, [transfer]);

  const submit = async () => {
    if (!transfer) return;
    setBusy(true);
    try {
      await receive({
        token,
        transferId,
        observed: transfer.items.map((i) => ({
          productVariantId: i.productVariantId,
          quantityObserved: observed[i.productVariantId] ?? 0,
        })),
      });
      toast.success(t("Transfer received"));
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  const short = transfer?.items.filter((i) => (observed[i.productVariantId] ?? 0) < i.quantity).length ?? 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={t("Receive transfer")}
      subtitle={transfer ? `${transfer.transferNumber} · ${transfer.source?.name ?? ""} → ${transfer.destination?.name ?? ""}` : undefined}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={submit} loading={busy} disabled={!transfer}>
            {t("Confirm receipt")}
          </Button>
        </>
      }
    >
      {!transfer ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <Table>
            <thead>
              <tr>
                <Th>{t("Item")}</Th>
                <Th className="text-right">{t("Sent")}</Th>
                <Th className="text-right">{t("Counted")}</Th>
              </tr>
            </thead>
            <tbody>
              {transfer.items.map((i) => {
                const value = observed[i.productVariantId] ?? 0;
                return (
                  <tr key={i._id}>
                    <Td>
                      {i.label} <span className="font-mono text-[11px]">{i.sku}</span>
                    </Td>
                    <Td className="text-right">{i.quantity}</Td>
                    <Td className="text-right">
                      <TextInput
                        type="number"
                        min={0}
                        max={i.quantity}
                        value={value}
                        onChange={(e) =>
                          setObserved((prev) => ({
                            ...prev,
                            [i.productVariantId]: Math.min(i.quantity, Math.max(0, Number(e.target.value) || 0)),
                          }))
                        }
                        className="w-24 ml-auto"
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {short > 0 && (
            <Badge tone="warning">
              {t("{count} line(s) short — recorded on the receipt", { count: short })}
            </Badge>
          )}
        </div>
      )}
    </Modal>
  );
}
