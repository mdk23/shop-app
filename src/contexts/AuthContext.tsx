"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { getStoredToken, setStoredToken, clearStoredToken } from "@/lib/auth";

// ─────────────────────────────────────────────
// DEV: auth bypass ("remove auth for now").
// When true, the app auto-provisions an admin session (convex/devAuth.ts)
// and skips the login flow entirely. Set to false to restore real auth.
// ─────────────────────────────────────────────
export const DEV_BYPASS_AUTH = true;
const DEV_TOKEN = "dev-bypass-session-token";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export type UserRole = "admin" | "manager" | "pos_seller";

export interface CurrentUser {
  sessionId: Id<"userSessions">;
  userId: Id<"users">;
  name: string;
  username: string;
  role: UserRole;
  expiresAt: number;
}

interface AuthContextValue {
  currentUser: CurrentUser | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  canAccess: (permission: Permission) => boolean;
}

// ─────────────────────────────────────────────
// PERMISSIONS
// ─────────────────────────────────────────────

export type Permission =
  | "manage_users"
  | "create_managers"
  | "create_pos_sellers"
  | "access_inventory"
  | "access_kitchen"
  | "access_reports"
  | "access_analytics"
  | "access_caixa"
  | "access_pos"
  | "access_customers"
  | "access_dishes"
  | "access_settings"
  | "view_audit_logs"
  | "delete_users";

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    "manage_users",
    "create_managers",
    "create_pos_sellers",
    "access_inventory",
    "access_kitchen",
    "access_reports",
    "access_analytics",
    "access_caixa",
    "access_pos",
    "access_customers",
    "access_dishes",
    "access_settings",
    "view_audit_logs",
    "delete_users",
  ],
  manager: [
    "create_pos_sellers",
    "access_inventory",
    "access_kitchen",
    "access_reports",
    "access_caixa",
    "access_pos",
    "access_customers",
  ],
  pos_seller: [
    "access_pos",
    "access_customers",
    "access_caixa",
  ],
};

// ─────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
const REFRESH_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    DEV_BYPASS_AUTH ? DEV_TOKEN : getStoredToken()
  );
  const [isLoading, setIsLoading] = useState(true);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loginAction = useAction(api.authActions.login);
  const logoutMutation = useMutation(api.auth.logout);
  const refreshMutation = useMutation(api.auth.refreshSession);
  const ensureDevSession = useMutation(api.devAuth.ensureDevSession);

  // Reactive session subscription
  const sessionData = useQuery(api.auth.getSession, { token });

  // DEV bypass: provision the admin session once on mount.
  useEffect(() => {
    if (DEV_BYPASS_AUTH) {
      ensureDevSession().catch(() => {});
    }
  }, [ensureDevSession]);

  // isLoading: true until useQuery has resolved at least once.
  // Under DEV bypass, keep waiting until the provisioned session lands
  // so components never see a null currentUser.
  useEffect(() => {
    if (sessionData === undefined) return;
    if (DEV_BYPASS_AUTH && sessionData === null) return;
    setIsLoading(false);
  }, [sessionData]);

  const currentUser: CurrentUser | null = sessionData ?? null;

  // ── Strict Expiration & Backend Invalidation ──
  useEffect(() => {
    if (DEV_BYPASS_AUTH) return; // no expiry / forced-logout while auth is bypassed

    // 1. If backend returns null but we have a token (meaning it was deleted/expired on server)
    if (!isLoading && token && sessionData === null) {
      clearStoredToken();
      setToken(null);
      // Hard redirect to fully purge React state and trigger warning banner
      window.location.href = `/login?reason=session_replaced&redirect=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    // 2. Exact millisecond expiration timer
    if (sessionData && sessionData.expiresAt) {
      const timeRemaining = sessionData.expiresAt - Date.now();
      
      if (timeRemaining <= 0) {
        clearStoredToken();
        setToken(null);
        return;
      }

      const exactExpireTimer = setTimeout(() => {
        clearStoredToken();
        setToken(null);
      }, timeRemaining);

      return () => clearTimeout(exactExpireTimer);
    }
  }, [token, sessionData, isLoading]);

  // ── Inactivity auto-logout ──
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (!token) return;

    inactivityTimerRef.current = setTimeout(async () => {
      if (token) {
        try {
          await logoutMutation({ token });
        } catch {
          // ignore
        }
        clearStoredToken();
        setToken(null);
      }
    }, INACTIVITY_TIMEOUT_MS);
  }, [token, logoutMutation]);

  useEffect(() => {
    if (DEV_BYPASS_AUTH) return; // no inactivity auto-logout while auth is bypassed
    if (!token) return;

    let lastRefresh = Date.now();
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    
    const handler = () => {
      resetInactivityTimer();
      
      // Throttle backend refresh to once every 5 minutes
      const now = Date.now();
      if (now - lastRefresh > REFRESH_THROTTLE_MS) {
        lastRefresh = now;
        if (token) refreshMutation({ token }).catch(() => {});
      }
    };

    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    resetInactivityTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [token, resetInactivityTimer, refreshMutation]);

  // ── Login ──
  const login = useCallback(
    async (username: string, password: string) => {
      let userAgent = undefined;
      let browser = undefined;
      let device = undefined;

      if (typeof window !== "undefined") {
        const ua = window.navigator.userAgent;
        userAgent = ua.slice(0, 250);
        device = /mobile/i.test(ua) ? "Mobile" : /tablet/i.test(ua) ? "Tablet" : "Desktop";
        
        if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua) && !/opr/i.test(ua)) {
          browser = "Chrome";
        } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
          browser = "Safari";
        } else if (/firefox|fxios/i.test(ua)) {
          browser = "Firefox";
        } else if (/edge|edg/i.test(ua)) {
          browser = "Edge";
        } else if (/opr/i.test(ua)) {
          browser = "Opera";
        } else {
          browser = "Other";
        }
      }

      const result = await loginAction({
        username,
        password,
        userAgent,
        device,
        browser,
      });
      setStoredToken(result.token);
      setToken(result.token);
    },
    [loginAction]
  );

  // ── Logout ──
  const logout = useCallback(async () => {
    if (token) {
      try {
        await logoutMutation({ token });
      } catch {
        // ignore — still clear locally
      }
    }
    clearStoredToken();
    setToken(null);
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
  }, [token, logoutMutation]);

  // ── Role helpers ──
  const hasRole = useCallback(
    (roles: UserRole | UserRole[]) => {
      if (!currentUser) return false;
      const arr = Array.isArray(roles) ? roles : [roles];
      return arr.includes(currentUser.role);
    },
    [currentUser]
  );

  const canAccess = useCallback(
    (permission: Permission) => {
      if (!currentUser) return false;
      return ROLE_PERMISSIONS[currentUser.role]?.includes(permission) ?? false;
    },
    [currentUser]
  );

  return (
    <AuthContext.Provider
      value={{ currentUser, token, isLoading, login, logout, hasRole, canAccess }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>");
  return ctx;
}
