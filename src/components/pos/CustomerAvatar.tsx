"use client";

import { cn } from "@/lib/utils";

export function CustomerAvatar({
  photoUrl,
  initials,
  size = "md",
}: {
  photoUrl?: string;
  initials: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims = size === "sm" ? "w-8 h-8 text-[10px]" : size === "lg" ? "w-14 h-14 text-lg" : "w-10 h-10 text-xs";
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        className={cn("rounded-full object-cover flex-shrink-0", dims)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-primary/10 text-primary flex items-center justify-center font-black flex-shrink-0",
        dims
      )}
    >
      {initials}
    </div>
  );
}
