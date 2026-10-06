"use client";

import React, { createContext, useContext, useEffect, useSyncExternalStore } from "react";

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

const THEME_KEYS: ThemeKey[] = ["sage", "cashmere", "copper"];
const THEME_EVENT = "takeaway-theme-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}
const readTheme = (): ThemeKey => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return THEME_KEYS.find((key) => key === saved) ?? "sage";
};
const serverTheme = (): ThemeKey => "sage";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read the saved theme without an effect; the server render uses the default theme.
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = (newTheme: ThemeKey) => {
    localStorage.setItem(STORAGE_KEY, newTheme);
    window.dispatchEvent(new Event(THEME_EVENT));
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
