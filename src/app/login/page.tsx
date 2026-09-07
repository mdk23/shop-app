"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Eye, EyeOff, LogIn, AlertCircle, ChefHat } from "lucide-react";
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
      {/* Dynamic Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-1/4 -right-1/4 w-[80vw] h-[80vw] rounded-full bg-primary/10 blur-[100px]" 
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.5, 1],
            rotate: [0, -90, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-1/4 -left-1/4 w-[60vw] h-[60vw] rounded-full bg-secondary/10 blur-[100px]" 
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        {/* Glass Card */}
        <div className="glass rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl border border-white/40 dark:border-white/10">
          {/* Header */}
          <div className="px-8 pt-12 pb-6 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-2 shadow-inner">
              <ChefHat className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-on-surface font-display text-4xl tracking-tight font-extrabold mb-2">
                Shop App
              </h1>
              <p className="text-on-surface-variant text-sm font-medium">
                Welcome back, please sign in to your staff portal.
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 pb-10 space-y-6">
            {/* Alerts */}
            <div className="space-y-3">
              <AnimatePresence>
                {sessionReplaced && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    className="flex items-start gap-3 p-4 bg-amber-50 text-amber-900 rounded-2xl border border-amber-200"
                  >
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold mb-1">Signed Out</p>
                      <p className="text-xs text-amber-700">
                        Your account was signed in from another device. You have been logged out.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    exit={{ opacity: 0, y: -8, height: 0 }}
                    className="flex items-start gap-3 p-4 bg-error/10 text-error rounded-2xl border border-error/20"
                  >
                    <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                    <p className="text-sm font-medium">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Inputs */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="username"
                  className="block text-xs font-semibold text-on-surface/80 uppercase tracking-wider ml-1"
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
                  className="w-full px-4 py-3.5 bg-surface/50 border border-outline-variant/50 rounded-2xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all backdrop-blur-sm shadow-inner"
                  placeholder="Enter your username"
                  autoFocus
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-on-surface/80 uppercase tracking-wider ml-1"
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
                    className="w-full px-4 py-3.5 pr-12 bg-surface/50 border border-outline-variant/50 rounded-2xl text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all backdrop-blur-sm shadow-inner"
                    placeholder="Enter your password"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors p-1"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5 opacity-70" />
                    ) : (
                      <Eye className="w-5 h-5 opacity-70" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className="text-xs font-semibold text-primary/80 hover:text-primary transition-colors"
                onClick={() =>
                  toast.info("Password Reset", {
                    description: "Please contact your system administrator to reset your password.",
                  })
                }
              >
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={isSubmitting || !username.trim() || !password}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 mt-2 bg-brand-gradient text-on-primary rounded-2xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-primary/30 transition-all"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <LogIn className="w-4 h-4 ml-1" />
                </>
              )}
            </motion.button>
          </form>
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
