"use client";

import React, { createContext, useCallback, useContext, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { pt } from "@/lib/i18n/pt";

export type Language = "pt" | "en";

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

interface LanguageContextType {
  language: Language;
  t: TranslateFn;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/**
 * Shop-wide language preference, backed by the Convex `settings` table
 * (`key: "language"`) — same shop for everyone, admin/manager-controlled
 * from `/settings`, exactly like the Business/Features settings sections.
 * Unlike `ThemeContext` (per-device, `localStorage`), this is a Convex
 * query, so it works before login too (`settings.getByKey` needs no token).
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const setting = useQuery(api.settings.getByKey, { key: "language" });
  const language: Language = setting?.value === "en" ? "en" : "pt";

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      const base = language === "en" ? key : (pt[key] ?? key);
      return vars ? interpolate(base, vars) : base;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, t }}>{children}</LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useTranslation must be used within a LanguageProvider");
  }
  return context;
}
