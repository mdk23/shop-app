"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const PUBLIC_PATHS = ["/login", "/setup", "/seed"];

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { currentUser, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;

    const isPublicPath = PUBLIC_PATHS.includes(pathname) || pathname === "/";

    if (!currentUser && !isPublicPath) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, currentUser, router, pathname]);

  const isPublicPath = PUBLIC_PATHS.includes(pathname) || pathname === "/";

  // Prevent flashing protected content while authentication resolves
  if (isLoading && !isPublicPath) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-background">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-on-surface-variant font-bold text-sm uppercase tracking-widest animate-pulse">
          Authenticating...
        </p>
      </div>
    );
  }

  // Prevent rendering children if unauthenticated on a protected page while redirecting
  if (!currentUser && !isPublicPath) {
    return null;
  }

  return <>{children}</>;
}
