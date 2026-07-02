"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, UserRole, Permission } from "@/contexts/AuthContext";

interface AuthGuardProps {
  children: React.ReactNode;
  /** Required role(s) — if omitted, only requires authentication */
  requiredRoles?: UserRole | UserRole[];
  /** Required permission — if omitted, only requires authentication */
  requiredPermission?: Permission;
}

/**
 * Wraps a page to protect it behind authentication and optional role/permission checks.
 * Shows a loading state while session resolves, redirects to /login if unauthenticated,
 * and shows an Access Denied screen if the role doesn't match.
 */
export function AuthGuard({ children, requiredRoles, requiredPermission }: AuthGuardProps) {
  const { currentUser, isLoading, hasRole, canAccess } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !currentUser) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, currentUser, router, pathname]);

  if (isLoading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-background">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-on-surface-variant font-bold text-sm uppercase tracking-widest animate-pulse">
          Authenticating...
        </p>
      </div>
    );
  }

  if (!currentUser) {
    // Redirect is happening via useEffect — show blank while routing
    return null;
  }

  // Role check
  if (requiredRoles && !hasRole(requiredRoles)) {
    return <AccessDenied />;
  }

  // Permission check
  if (requiredPermission && !canAccess(requiredPermission)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

function AccessDenied() {
  const router = useRouter();
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center gap-6 bg-background p-8">
      <div className="w-20 h-20 rounded-2xl bg-error/10 border-2 border-error flex items-center justify-center">
        <span className="text-4xl">🔒</span>
      </div>
      <div className="text-center">
        <h1 className="text-3xl font-display text-on-surface mb-2">Access Denied</h1>
        <p className="text-on-surface-variant font-bold text-sm">
          You don't have permission to view this page.
        </p>
      </div>
      <button
        onClick={() => router.back()}
        className="px-6 py-3 bg-primary text-on-primary rounded-xl font-black text-xs uppercase tracking-widest hover:bg-secondary transition-colors"
      >
        Go Back
      </button>
    </div>
  );
}
