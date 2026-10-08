"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { useTranslation } from "@/contexts/LanguageContext";

/**
 * Whether the branch has no open register. Every payment (and every refund except store
 * credit) needs one, so screens that take money check it up front. `false` while loading
 * or when no branch is known yet, so nothing is blocked before the answer arrives.
 */
export function useRegisterClosed(branchId: string | undefined | null): boolean {
  const token = useToken();
  const session = useQuery(
    api.cashRegister.getActiveSession,
    token && branchId ? { token, branchId } : "skip"
  );
  return session === null;
}

/** Warning shown where money is taken or given back while the register is closed. */
export function RegisterClosedNotice({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm ${className}`}
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
      <span className="font-bold">{t("The register is closed.")}</span>
      <span className="text-on-surface-variant">{t("Open the register before taking payments.")}</span>
      <Link href="/cash-register" className="ml-auto">
        <Button size="sm">{t("Open register")}</Button>
      </Link>
    </div>
  );
}
