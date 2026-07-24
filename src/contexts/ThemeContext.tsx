"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeKey = "sage" | "cashmere" | "copper";

export interface ThemeOption {
  key: ThemeKey;
  name: string;
  primary: string;
  accent: string;
  bgPreview: string;
  description: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    key: "sage",
    name: "Soft Sage & Deep Olive",
    primary: "#ACC8A2",
    accent: "#1A2517",
    bgPreview: "#F5F8F4",
    description: "Calm, natural tones with Soft Sage highlights and Deep Olive accents.",
  },
  {
    key: "cashmere",
    name: "Cashmere & Royal Garnet",
    primary: "#90353D",
    accent: "#F4EDE3",
    bgPreview: "#F7F2EA",
    description: "Warm, sophisticated Cashmere surfaces with rich Royal Garnet details.",
  },
  {
    key: "copper",
    name: "Ash Black & Copper Glow",
    primary: "#D99058",
    accent: "#3B3C36",
    bgPreview: "#F8F8F7",
    description: "Sleek Ash Black structure paired with energetic Copper Glow highlights.",
  },
];

interface ThemeContextType {
  theme: ThemeKey;
  setTheme: (theme: ThemeKey) => void;
  currentThemeOption: ThemeOption;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "takeaway_app_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>("sage");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeKey | null;
    if (saved && ["sage", "cashmere", "copper"].includes(saved)) {
      setThemeState(saved);
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      document.documentElement.setAttribute("data-theme", "sage");
    }
  }, []);

  const setTheme = (newTheme: ThemeKey) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  const currentThemeOption =
    THEME_OPTIONS.find((t) => t.key === theme) || THEME_OPTIONS[0];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, currentThemeOption }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
