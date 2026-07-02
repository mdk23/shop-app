"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ConvexError } from "convex/values";
import { toast } from "sonner";

function LoginForm() {
  const { login, currentUser, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReplaced, setSessionReplaced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const redirectTo = searchParams.get("redirect") || "/pos";

  useEffect(() => {
    if (searchParams.get("reason") === "session_replaced") {
      setSessionReplaced(true);
    }
  }, [searchParams]);

  // If already logged in, redirect immediately
  useEffect(() => {
    if (!isLoading && currentUser) {
      router.replace(redirectTo);
    }
  }, [isLoading, currentUser, router, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;

    setError(null);
    setSessionReplaced(false);
    setIsSubmitting(true);

    try {
      await login(username.trim(), password);
      router.replace(redirectTo);
    } catch (err: unknown) {
      let code = "UNKNOWN_ERROR";
      if (err instanceof ConvexError && typeof err.data === "string") {
        code = err.data;
      }

      if (code === "ACCOUNT_DISABLED") {
        toast.error("Account Disabled", {
          description: "Your account has been deactivated. Please contact the administrator to restore access.",
          duration: 5000,
        });
        setPassword("");
        passwordRef.current?.focus();
        setError(null);
      } else if (code === "INVALID_CREDENTIALS" || code === "USER_NOT_FOUND") {
        toast.error("Login Failed", { description: "Invalid username or password." });
        setPassword("");
        passwordRef.current?.focus();
        setError(null);
      } else {
        toast.error("Something went wrong. Please try again later.");
        setError(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/8 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 39px,
              var(--outline) 39px,
              var(--outline) 40px
            ), repeating-linear-gradient(
              90deg,
              transparent,
              transparent 39px,
              var(--outline) 39px,
              var(--outline) 40px
            )`,
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="w-full max-w-md relative z-10"
      >
        {/* Card */}
        <div className="bg-surface border-2 border-outline rounded-3xl shadow-hard-lg overflow-hidden">
          {/* Header */}
          <div className="bg-primary px-8 pt-10 pb-8 flex flex-col items-center gap-4 relative overflow-hidden">
            {/* Shimmer */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: "300%" }}
              transition={{ repeat: Infinity, duration: 3, ease: "linear", repeatDelay: 2 }}
              className="absolute inset-0 bg-white/10 skew-x-[20deg]"
            />

            <div className="relative z-10 flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-2xl bg-on-primary/10 border-2 border-on-primary/20 flex items-center justify-center shadow-inner overflow-hidden">
                <img
                  src="/logo2.png"
                  alt="Olympia Chicken"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
              <div className="text-center">
                <h1 className="text-on-primary font-display text-3xl tracking-tighter leading-none">
                  Olympia Chicken
                </h1>
                <p className="text-on-primary/70 text-xs font-bold uppercase tracking-[0.25em] mt-1">
                  Staff Portal
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            <div>
              <p className="text-on-surface font-black text-lg mb-1">Welcome back</p>
              <p className="text-on-surface-variant text-sm font-bold">
                Sign in to access your workspace
              </p>
            </div>

            {/* Session Replaced Alert */}
            <AnimatePresence>
              {sessionReplaced && (
                <motion.div
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl"
                >
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-700 dark:text-amber-400 text-sm font-black leading-none mb-1">Signed Out</p>
                    <p className="text-amber-600 dark:text-amber-300 text-xs font-bold leading-snug">
                      Your account was signed in from another device. You have been logged out.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Alert */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  className="flex items-start gap-3 p-4 bg-error/10 border border-error/30 rounded-2xl"
                >
                  <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
                  <p className="text-error text-sm font-bold leading-snug">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Username */}
            <div className="space-y-2">
              <label
                htmlFor="username"
                className="block text-xs font-black text-on-surface uppercase tracking-widest"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                  setSessionReplaced(false);
                }}
                className="w-full px-4 py-3.5 bg-surface-container-low border-2 border-outline rounded-xl font-bold text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:bg-surface transition-all"
                placeholder="Enter your username"
                autoFocus
                disabled={isSubmitting}
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="block text-xs font-black text-on-surface uppercase tracking-widest"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  ref={passwordRef}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                    setSessionReplaced(false);
                  }}
                  className="w-full px-4 py-3.5 pr-12 bg-surface-container-low border-2 border-outline rounded-xl font-bold text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:bg-surface transition-all"
                  placeholder="Enter your password"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot password (placeholder) */}
            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs font-bold text-primary/70 hover:text-primary transition-colors"
                onClick={() =>
                  alert("Please contact your system administrator to reset your password.")
                }
              >
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={isSubmitting || !username.trim() || !password}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 bg-primary text-on-primary rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary transition-colors shadow-hard"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </motion.button>
          </form>

          {/* Footer */}
          <div className="px-8 py-4 border-t-2 border-outline bg-surface-container-low/50 text-center">
            <p className="text-xs text-on-surface-variant/60 font-bold">
              Olympia Chicken POS — Secure Staff Access
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-full flex items-center justify-center bg-background">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
