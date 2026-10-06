"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, TextInput, Select, Modal, Badge, EmptyState, Spinner, Toolbar } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Dialog = null | "offer" | "assortment" | "item" | "include";

export default function OffersPage() {
  const { t } = useTranslation();
  const token = useToken();
  const offers = useQuery(api.offers.list, { token });
  const assortments = useQuery(api.offers.listAssortments, { token });
  const products = useQuery(api.products.list, {});
  const createOffer = useMutation(api.offers.createOffer);
  const createAssortment = useMutation(api.offers.createAssortment);
  const addItem = useMutation(api.offers.addAssortmentItem);
  const include = useMutation(api.offers.includeAssortment);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  const [assortmentId, setAssortmentId] = useState("");
  const [productId, setProductId] = useState("");
  const [offerId, setOfferId] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setDialog(null);
    setText("");
    setAssortmentId("");
    setProductId("");
    setOfferId("");
  };

  const save = async () => {
    setBusy(true);
    try {
      if (dialog === "offer") {
        await createOffer({ token, description: text });
      } else if (dialog === "assortment") {
        await createAssortment({ token, name: text });
      } else if (dialog === "item") {
        await addItem({
          token,
          assortmentId: assortmentId as Id<"assortments">,
          productId: productId as Id<"products">,
        });
      } else if (dialog === "include") {
        await include({
          token,
          offerId: offerId as Id<"offers">,
          assortmentId: assortmentId as Id<"assortments">,
        });
      }
      toast.success(t("Saved"));
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const canSave =
    dialog === "offer" || dialog === "assortment"
      ? text.trim().length > 0
      : dialog === "item"
        ? !!assortmentId && !!productId
        : !!offerId && !!assortmentId;

  return (
    <PageLayout title={t("Offers")} subtitle={t("Offers are built from assortments of products, valid from a date")}>
      <Toolbar>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDialog("assortment")}>
            <Plus className="w-3.5 h-3.5" /> {t("New assortment")}
          </Button>
          <Button variant="secondary" onClick={() => setDialog("item")}>
            <Plus className="w-3.5 h-3.5" /> {t("Add product to assortment")}
          </Button>
        </div>
        <div className="ml-auto" />
        <Button onClick={() => setDialog("offer")}>
          <Plus className="w-3.5 h-3.5" /> {t("New offer")}
        </Button>
      </Toolbar>

      {offers === undefined ? (
        <Spinner />
      ) : offers.length === 0 ? (
        <Card>
          <EmptyState
            title={t("No offers yet")}
            message={t("Create an assortment with products, then include it in an offer.")}
            action={<Button onClick={() => setDialog("offer")}>{t("New offer")}</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => (
            <Card key={offer._id} className="p-4 space-y-3">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-bold">{offer.description}</p>
                  <p className="text-xs text-on-surface-variant">
                    {t("Since")} {formatDate(offer.constitutedAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setOfferId(offer._id);
                    setDialog("include");
                  }}
                >
                  {t("Include assortment")}
                </Button>
              </div>
              {offer.assortments.length === 0 ? (
                <p className="text-xs text-on-surface-variant">{t("No assortments in this offer yet.")}</p>
              ) : (
                <div className="space-y-2">
                  {offer.assortments.map((a) => (
                    <div key={a._id} className="p-3 rounded-xl border border-outline bg-surface-container-low">
                      <div className="flex justify-between gap-2">
                        <span className="text-sm font-bold">{a.name}</span>
                        <Badge tone="info">
                          {a.items.length} {t("product(s)")}
                        </Badge>
                      </div>
                      {a.items.length > 0 && (
                        <p className="text-xs text-on-surface-variant mt-1">
                          {a.items.map((i) => i.productName).join(" · ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={dialog !== null}
        onClose={close}
        title={
          dialog === "offer"
            ? t("New offer")
            : dialog === "assortment"
              ? t("New assortment")
              : dialog === "item"
                ? t("Add product to assortment")
                : t("Include assortment")
        }
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {t("Cancel")}
            </Button>
            <Button onClick={save} loading={busy} disabled={!canSave}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {(dialog === "offer" || dialog === "assortment") && (
            <Field label={dialog === "offer" ? t("Description") : t("Name")} required>
              <TextInput
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={dialog === "offer" ? t("e.g. Back to school") : t("e.g. Denim essentials")}
              />
            </Field>
          )}
          {(dialog === "item" || dialog === "include") && (
            <Field label={t("Assortment")} required>
              <Select value={assortmentId} onChange={(e) => setAssortmentId(e.target.value)}>
                <option value="">{t("Choose")}</option>
                {(assortments ?? []).map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {dialog === "item" && (
            <Field label={t("Product")} required>
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">{t("Choose")}</option>
                {(products ?? []).map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {dialog === "include" && (
            <Field label={t("Offer")} required>
              <Select value={offerId} onChange={(e) => setOfferId(e.target.value)}>
                <option value="">{t("Choose")}</option>
                {(offers ?? []).map((o) => (
                  <option key={o._id} value={o._id}>
                    {o.description}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </Modal>
    </PageLayout>
  );
}
