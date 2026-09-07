"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Shield, Check } from "lucide-react";
import {
  Role,
  ROLE_CONFIG,
  inputClass,
  FormField,
  ErrorAlert,
  ModalWrapper,
  ModalHeader,
  ModalFooter,
} from "./Shared";

interface UserFormModalProps {
  user?: { _id: Id<"users">; name: string; username: string; role: Role };
  onClose: () => void;
  actingUser: { userId: Id<"users">; username: string; role: Role };
}

export function UserFormModal({ user, onClose, actingUser }: UserFormModalProps) {
  const { token } = useAuth();
  const createUser = useAction(api.usersActions.createUser);
  const updateUser = useMutation(api.users.update);

  const isEdit = !!user;

  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(user?.role ?? "pos_seller");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admins can create any role; managers can only create pos_sellers
  const availableRoles: Role[] =
    actingUser.role === "admin"
      ? ["admin", "manager", "pos_seller"]
      : ["pos_seller"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isEdit) {
        await updateUser({
          token: token!,
          id: user._id,
          name,
          role,
        });
        toast.success("User updated successfully");
      } else {
        await createUser({
          token: token!,
          name,
          username,
          password,
          role,
        });
        toast.success(`User "${username}" created successfully`);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <ModalHeader
          title={isEdit ? "Edit User" : "Create New User"}
          onClose={onClose}
        />

        <div className="flex-1 p-6 space-y-5 overflow-y-auto">
          {error && <ErrorAlert message={error} />}

          <FormField label="Full Name" htmlFor="name">
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Ana Joaquim"
              required
              disabled={submitting}
            />
          </FormField>

          {!isEdit && (
            <FormField label="Username" htmlFor="username">
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                className={inputClass}
                placeholder="e.g. ana.joaquim"
                required
                disabled={submitting}
                autoComplete="off"
              />
            </FormField>
          )}

          {!isEdit && (
            <FormField label="Password" htmlFor="password">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="Minimum 4 characters"
                required
                minLength={4}
                disabled={submitting}
                autoComplete="new-password"
              />
            </FormField>
          )}

          <FormField label="Role" htmlFor="role">
            <div className="grid grid-cols-1 gap-2">
              {availableRoles.map((r) => {
                const cfg = ROLE_CONFIG[r];
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left",
                      role === r
                        ? `${cfg.bg} ${cfg.border} ${cfg.color}`
                        : "border-outline bg-surface-container-low hover:border-outline text-on-surface-variant"
                    )}
                  >
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        role === r ? cfg.bg : "bg-surface-container-high"
                      )}
                    >
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-black text-sm">{cfg.label}</p>
                      <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">
                        {r === "admin"
                          ? "Full access"
                          : r === "manager"
                          ? "Operational access"
                          : "POS & register only"}
                      </p>
                    </div>
                    {role === r && (
                      <Check className="w-4 h-4 ml-auto shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </FormField>
        </div>

        <ModalFooter
          onClose={onClose}
          submitLabel={isEdit ? "Save Changes" : "Create User"}
          submitting={submitting}
        />
      </form>
    </ModalWrapper>
  );
}
