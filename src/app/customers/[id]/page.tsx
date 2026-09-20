"use client";

import { useParams, useRouter } from "next/navigation";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button } from "@/components/ui";
import { CustomerFicha } from "@/components/customers/CustomerFicha";
import { ArrowLeft } from "lucide-react";

export default function CustomerFichaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <PageLayout title="Ficha do Cliente" subtitle="CRM · perfil completo">
      <Button variant="ghost" onClick={() => router.push("/customers")} className="mb-3">
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar
      </Button>
      <CustomerFicha customerId={params.id as Id<"customers">} variant="page" />
    </PageLayout>
  );
}
