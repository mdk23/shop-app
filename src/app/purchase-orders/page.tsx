"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Button,
  Field,
  Select,
  TextInput,
  Textarea,
  Modal,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Spinner,
  Toolbar,
} from "@/components/ui";
import { VariantPicker, PickedVariant } from "@/components/VariantPicker";
import { useToken, useCurrency, useResolvedBranch } from "@/lib/useShop";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "success" | "error"> = {
  draft: "neutral",
  sent: "info",
  partially_received: "warning",
  completed: "success",
  cancelled: "error",
};

type Line = PickedVariant & { quantityOrdered: number; unitCost: number };

export default function PurchaseOrdersPage() {
  const token = useToken();
  const fmt = useCurrency();
  const { branchId, branches } = useResolvedBranch();
  const suppliers = useQuery(api.suppliers.list, { status: "active" });
  const [statusFilter, setStatusFilter] = useState("");
  const list = useQuery(api.purchaseOrders.list, {
    status: (statusFilter || undefined) as never,
  });
  const create = useMutation(api.purchaseOrders.create);

  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<Id<"purchaseOrders"> | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [poBranch, setPoBranch] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  const total = lines.reduce((s, l) => s + l.quantityOrdered * l.unitCost, 0);

  const submit = async () => {
    const b = (poBranch || branchId) as Id<"branches"> | undefined;
    if (!supplierId || !b) return toast.error("Supplier and branch required.");
    if (lines.length === 0) return toast.error("Add at least one line.");
    setBusy(true);
    try {
      await create({
        token,
        supplierId: supplierId as Id<"suppliers">,
        branchId: b,
        orderDate: Date.now(),
        notes: notes || undefined,
        items: lines.map((l) => ({
          productVariantId: l.variantId,
          quantityOrdered: l.quantityOrdered,
          unitCost: l.unitCost,
        })),
      });
      toast.success("Purchase order created");
      setOpen(false);
      setLines([]);
      setSupplierId("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title="Purchase Orders" subtitle="Purchasing · restock from suppliers">
      <Toolbar>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-44"
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="partially_received">Partially received</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <div className="ml-auto" />
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> New PO
        </Button>
      </Toolbar>

      <Card>
        {list === undefined ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState title="No purchase orders" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Supplier</Th>
                <Th>Date</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
                <Th>Payment</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((po) => (
                <tr key={po._id} className="hover:bg-surface-container-low">
                  <Td className="font-mono text-[11px] font-bold">{po.orderCode}</Td>
                  <Td>{po.supplierName}</Td>
                  <Td className="text-on-surface-variant text-xs">
                    {new Date(po.orderDate).toLocaleDateString()}
                  </Td>
                  <Td className="text-right font-bold">{fmt(po.totalAmount)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[po.status]}>
                      {po.status.replace(/_/g, " ")}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={po.paymentStatus === "paid" ? "success" : "neutral"}>
                      {po.paymentStatus.replace("_", " ")}
                    </Badge>
                  </Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => setDetailId(po._id)}>
                      Open
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="New Purchase Order"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Create ({fmt(total)})
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Supplier" required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Select…</option>
              {(suppliers ?? []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Receive into branch" required>
            <Select
              value={poBranch || branchId || ""}
              onChange={(e) => setPoBranch(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Add items">
          <VariantPicker
            onPick={(v) =>
              setLines((p) =>
                p.some((l) => l.variantId === v.variantId)
                  ? p
                  : [...p, { ...v, quantityOrdered: 1, unitCost: v.costPrice }]
              )
            }
          />
        </Field>

        {lines.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Item</Th>
                <Th className="text-right w-20">Qty</Th>
                <Th className="text-right w-28">Unit cost</Th>
                <Th className="text-right w-28">Line</Th>
                <Th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.variantId}>
                  <Td className="text-xs">{l.label}</Td>
                  <Td>
                    <input
                      type="number"
                      value={l.quantityOrdered}
                      onChange={(e) =>
                        setLines((p) =>
                          p.map((x, j) =>
                            j === i
                              ? { ...x, quantityOrdered: Number(e.target.value) }
                              : x
                          )
                        )
                      }
                      className="w-16 px-2 py-1 bg-surface-container-low border border-outline rounded-lg text-xs text-right"
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      value={l.unitCost}
                      onChange={(e) =>
                        setLines((p) =>
                          p.map((x, j) =>
                            j === i ? { ...x, unitCost: Number(e.target.value) } : x
                          )
                        )
                      }
                      className="w-20 px-2 py-1 bg-surface-container-low border border-outline rounded-lg text-xs text-right"
                    />
                  </Td>
                  <Td className="text-right text-xs font-bold">
                    {fmt(l.quantityOrdered * l.unitCost)}
                  </Td>
                  <Td>
                    <button
                      onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                      className="text-on-surface-variant hover:text-error"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Modal>

      {detailId && (
        <PODetail token={token} id={detailId} fmt={fmt} onClose={() => setDetailId(null)} />
      )}
    </PageLayout>
  );
}

function PODetail({
  token,
  id,
  fmt,
  onClose,
}: {
  token: string;
  id: Id<"purchaseOrders">;
  fmt: (n: number) => string;
  onClose: () => void;
}) {
  const po = useQuery(api.purchaseOrders.get, { id });
  const updateStatus = useMutation(api.purchaseOrders.updateStatus);
  const receiveItems = useMutation(api.purchaseOrders.receiveItems);
  const updatePayment = useMutation(api.purchaseOrders.updatePaymentStatus);
  const removePo = useMutation(api.purchaseOrders.remove);
  const [receiving, setReceiving] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const doReceive = () => {
    const items = Object.entries(receiving)
      .map(([variantId, q]) => ({
        productVariantId: variantId as Id<"productVariants">,
        quantityReceived: Number(q) || 0,
      }))
      .filter((x) => x.quantityReceived > 0);
    if (items.length === 0) return toast.error("Enter received quantities.");
    run(() => receiveItems({ token, id, items }).then(() => setReceiving({})), "Stock received");
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={po ? `PO ${po.orderCode}` : "Purchase Order"}
      subtitle={po ? `${po.supplierName}${po.branchName ? ` → ${po.branchName}` : ""}` : undefined}
      footer={
        po && (
          <div className="flex flex-wrap gap-2">
            {po.status === "draft" && (
              <>
                <Button
                  variant="danger"
                  loading={busy}
                  onClick={() =>
                    run(() => removePo({ token, id }).then(onClose), "Deleted")
                  }
                >
                  Delete
                </Button>
                <Button
                  loading={busy}
                  onClick={() =>
                    run(
                      () => updateStatus({ token, id, status: "sent" }),
                      "Marked as sent"
                    )
                  }
                >
                  Mark sent
                </Button>
              </>
            )}
            {(po.status === "sent" || po.status === "partially_received") && (
              <Button loading={busy} onClick={doReceive}>
                Receive entered qty
              </Button>
            )}
            {po.paymentStatus !== "paid" && po.status !== "cancelled" && (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() =>
                  run(
                    () => updatePayment({ token, id, paymentStatus: "paid" }),
                    "Marked paid"
                  )
                }
              >
                Mark paid
              </Button>
            )}
          </div>
        )
      }
    >
      {!po ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th className="text-right">Ordered</Th>
              <Th className="text-right">Received</Th>
              <Th className="text-right">Unit cost</Th>
              {(po.status === "sent" || po.status === "partially_received") && (
                <Th className="text-right w-24">Receive</Th>
              )}
            </tr>
          </thead>
          <tbody>
            {po.items.map((it) => (
              <tr key={it._id}>
                <Td className="text-xs">
                  {it.productName} <span className="text-on-surface-variant">({it.variantLabel})</span>
                </Td>
                <Td className="text-right">{it.quantityOrdered}</Td>
                <Td className="text-right font-bold">{it.quantityReceived}</Td>
                <Td className="text-right">{fmt(it.unitCost)}</Td>
                {(po.status === "sent" || po.status === "partially_received") && (
                  <Td>
                    <input
                      type="number"
                      value={
                        it.productVariantId
                          ? receiving[it.productVariantId] ?? ""
                          : ""
                      }
                      onChange={(e) =>
                        it.productVariantId &&
                        setReceiving((p) => ({
                          ...p,
                          [it.productVariantId as string]: e.target.value,
                        }))
                      }
                      placeholder={String(it.quantityOrdered - it.quantityReceived)}
                      className="w-20 px-2 py-1 bg-surface-container-low border border-outline rounded-lg text-xs text-right"
                    />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}
