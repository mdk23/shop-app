"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

/* ---------- colour maths (hex ↔ HSV) ---------- */

type Hsv = { h: number; s: number; v: number }; // h 0–360, s/v 0–1

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

export function isHex(value: string): boolean {
  return /^#([0-9a-f]{6})$/i.test(value);
}

/** "#abc", "abc", "#AABBCC" → "#aabbcc"; anything else → null. */
export function normalizeHex(value: string): string | null {
  let v = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(v)) v = v.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(v) ? `#${v.toLowerCase()}` : null;
}

function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`;
}

/** Readable text colour on top of `hex`. */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#1f1f1f" : "#ffffff";
}

/* ---------- drag helper ---------- */

function useDrag(onMove: (x: number, y: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const move = useCallback(
    (e: PointerEvent<HTMLDivElement> | globalThis.PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      onMove(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height));
    },
    [onMove]
  );
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e);
  };
  return { ref, onPointerDown, onPointerMove };
}

/* ---------- the picker ---------- */

/**
 * Drag to choose a colour: the square sets how light and how vivid it is, the bar below
 * sets the hue. Arrow keys move either one (Shift for bigger steps).
 */
export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  // Keep HSV locally so the hue survives dragging to grey/black (where hex loses it).
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(normalizeHex(value) ?? "#000000"));
  const lastEmitted = useRef(value);

  useEffect(() => {
    const hex = normalizeHex(value);
    if (hex && hex !== lastEmitted.current) {
      setHsv(hexToHsv(hex));
      lastEmitted.current = hex;
    }
  }, [value]);

  const update = useCallback(
    (next: Hsv) => {
      setHsv(next);
      const hex = hsvToHex(next);
      lastEmitted.current = hex;
      onChange(hex);
    },
    [onChange]
  );

  const area = useDrag(useCallback((x, y) => update({ ...hsv, s: x, v: 1 - y }), [hsv, update]));
  const hue = useDrag(useCallback((x) => update({ ...hsv, h: x * 360 }), [hsv, update]));

  const areaKeys = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: clamp(hsv.s - step) },
      ArrowRight: { s: clamp(hsv.s + step) },
      ArrowUp: { v: clamp(hsv.v + step) },
      ArrowDown: { v: clamp(hsv.v - step) },
    };
    if (moves[e.key]) {
      e.preventDefault();
      update({ ...hsv, ...moves[e.key] });
    }
  };
  const hueKeys = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 30 : 5;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      update({ ...hsv, h: clamp(hsv.h + (e.key === "ArrowRight" ? step : -step), 0, 360) });
    }
  };

  const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const current = hsvToHex(hsv);

  return (
    <div className="space-y-3 select-none">
      <div
        {...area}
        role="slider"
        tabIndex={0}
        aria-label="Shade"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.v * 100)}
        aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        onKeyDown={areaKeys}
        className="relative h-44 w-full rounded-xl cursor-crosshair touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pureHue})`,
        }}
      >
        <span
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.35)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }}
        />
      </div>

      <div
        {...hue}
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onKeyDown={hueKeys}
        className="relative h-4 w-full rounded-full cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={{
          background:
            "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_2px_6px_rgba(0,0,0,0.35)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: pureHue }}
        />
      </div>
    </div>
  );
}

/** Common clothing colours, one click away. */
export const PRESET_COLORS: { name: string; hex: string }[] = [
  { name: "Black", hex: "#111111" },
  { name: "White", hex: "#ffffff" },
  { name: "Grey", hex: "#8a8a8a" },
  { name: "Navy", hex: "#1f2a44" },
  { name: "Blue", hex: "#2f6fd1" },
  { name: "Light Blue", hex: "#9cc3e6" },
  { name: "Red", hex: "#c62828" },
  { name: "Burgundy", hex: "#7b1e2f" },
  { name: "Pink", hex: "#f2a7c3" },
  { name: "Green", hex: "#2e7d32" },
  { name: "Olive", hex: "#6b6b2a" },
  { name: "Yellow", hex: "#f2c94c" },
  { name: "Orange", hex: "#ef7d22" },
  { name: "Beige", hex: "#d9c7a7" },
  { name: "Brown", hex: "#6d4c35" },
  { name: "Purple", hex: "#6a3d9a" },
];

export function PresetSwatches({
  value,
  onPick,
}: {
  value: string;
  onPick: (preset: { name: string; hex: string }) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {PRESET_COLORS.map((p) => {
        const selected = normalizeHex(value) === p.hex;
        return (
          <button
            key={p.hex}
            type="button"
            title={p.name}
            aria-label={p.name}
            aria-pressed={selected}
            onClick={() => onPick(p)}
            className={cn(
              "aspect-square w-full rounded-full border border-outline transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              selected && "ring-2 ring-primary ring-offset-2 ring-offset-surface"
            )}
            style={{ background: p.hex }}
          />
        );
      })}
    </div>
  );
}
