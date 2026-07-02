"use client";

import { Toaster } from "sonner";

export function SonnerProvider() {
  return (
    <Toaster 
      position="top-right" 
      toastOptions={{
        style: {
          background: "var(--color-surface)",
          color: "var(--color-on-surface)",
          border: "1px solid var(--color-outline-variant)",
          borderRadius: "1rem",
        },
      }}
    />
  );
}
