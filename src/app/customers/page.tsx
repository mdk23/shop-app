"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Button,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Pagination,
  Toolbar,
  inputClass,
} from "@/components/ui";
import { usePagedQuery } from "@/lib/pagination";
import { CustomerFormModal } from "@/components/customers/CustomerFormModal";
import { Plus, Search, Pencil } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Customer = {
  _id: Id<"customers">;
  name: string;
  phone1: string;
  phone2?: string;
  phone3?: string;
  email?: string;
  address?: string;
  notes?: string;
  customerCode?: string;
  isGeneric?: boolean;
  status?: string;
};

export default function CustomersPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const searchResults = useQuery(
    api.customers.search,
    search.trim() ? { query: search } : "skip"
  );
  const {
    rows: pagedResults,
    isLoading: pagedLoading,
    pageIndex,
    pageSize,
    hasPrev,
    hasNext,
    goPrev,
    goNext,
  } = usePagedQuery(api.customers.listPaginated, search.trim() ? "skip" : {});

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);

  const isSearching = !!search.trim();
  const list = (isSearching ? searchResults ?? [] : pagedResults) as Customer[];
  const isLoading = isSearching ? searchResults === undefined : pagedLoading;

  return (
    <PageLayout title={t("Customers")} subtitle={t("CRM · accounts, debt & store credit")}>
      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-64`}
            placeholder={t("Search name / phone / code")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ml-auto" />
        <Button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="w-3.5 h-3.5" /> {t("New Customer")}
        </Button>
      </Toolbar>

      <Card>
        {list.length === 0 && !isLoading ? (
          <EmptyState title={t("No customers")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("Code")}</Th>
                <Th>{t("Name")}</Th>
                <Th>{t("Phone")}</Th>
                <Th>{t("Email")}</Th>
                <Th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr
                  key={c._id}
                  className="hover:bg-surface-container-low cursor-pointer"
                  onClick={() => router.push(`/customers/${c._id}`)}
                >
                  <Td className="font-mono text-[11px]">{c.customerCode ?? "—"}</Td>
                  <Td className="font-bold">
                    {c.name}
                    {c.isGeneric && (
                      <Badge tone="neutral">
                        <span className="ml-1">{t("walk-in")}</span>
                      </Badge>
                    )}
                  </Td>
                  <Td>{c.phone1}</Td>
                  <Td className="text-on-surface-variant">{c.email ?? "—"}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {!c.isGeneric && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(c);
                          setModalOpen(true);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!isSearching && !isLoading && list.length > 0 && (
          <Pagination
            pageIndex={pageIndex}
            rowCount={list.length}
            pageSize={pageSize}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={goPrev}
            onNext={goNext}
          />
        )}
      </Card>

      {modalOpen && (
        <CustomerFormModal
          existing={editing}
          onClose={() => setModalOpen(false)}
        />
      )}
    </PageLayout>
  );
}
