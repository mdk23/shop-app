"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Shield, AlertTriangle } from "lucide-react";

export default function SetupPage() {
  const seedAdmin = useAction(api.usersActions.seedAdmin);
  const router = useRouter();

  const [name, setName] = useState("Admin");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await seedAdmin({ name, username, password });
      setDone(true);
      toast.success("Admin account created successfully!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create admin");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-surface border-2 border-outline rounded-3xl p-8 max-w-sm w-full text-center shadow-hard-lg">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-display text-on-surface mb-2">Setup Complete!</h1>
          <p className="text-sm text-on-surface-variant font-bold mb-6">
            Admin account <strong>@{username}</strong> created. You can now log in.
          </p>
          <button
            onClick={() => router.replace("/login")}
            className="w-full py-4 bg-primary text-on-primary rounded-xl font-black text-sm uppercase tracking-widest hover:bg-secondary transition-colors shadow-hard"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-surface border-2 border-outline rounded-3xl overflow-hidden shadow-hard-lg">
          <div className="bg-primary px-8 py-8 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-on-primary/10 flex items-center justify-center">
              <Shield className="w-8 h-8 text-on-primary" />
            </div>
            <div className="text-center">
              <h1 className="font-display text-on-primary text-2xl">System Setup</h1>
              <p className="text-on-primary/70 text-xs font-bold uppercase tracking-widest mt-1">
                Create First Admin Account
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-amber-600 dark:text-amber-400 text-xs font-bold">
                This page is only for first-time setup. Remove it from production after creating your admin account.
              </p>
            </div>

            {[
              { label: "Full Name", id: "name", value: name, setter: setName, type: "text", placeholder: "Admin Name" },
              { label: "Username", id: "username", value: username, setter: (v: string) => setUsername(v.toLowerCase()), type: "text", placeholder: "admin" },
              { label: "Password", id: "password", value: password, setter: setPassword, type: "password", placeholder: "Min. 4 characters" },
            ].map(({ label, id, value, setter, type, placeholder }) => (
              <div key={id} className="space-y-2">
                <label htmlFor={id} className="block text-xs font-black text-on-surface uppercase tracking-widest">
                  {label}
                </label>
                <input
                  id={id}
                  type={type}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full px-4 py-3 bg-surface-container-low border-2 border-outline rounded-xl font-bold text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-all text-sm"
                  placeholder={placeholder}
                  required
                  minLength={type === "password" ? 4 : 1}
                  disabled={submitting}
                  autoComplete={type === "password" ? "new-password" : "off"}
                />
              </div>
            ))}

            <button
              type="submit"
              disabled={submitting || !name || !username || !password}
              className="w-full py-4 bg-primary text-on-primary rounded-xl font-black text-sm uppercase tracking-widest hover:bg-secondary transition-colors shadow-hard disabled:opacity-50"
            >
              {submitting ? "Creating Admin..." : "Create Admin Account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
