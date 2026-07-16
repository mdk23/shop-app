"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import {
  inputClass,
  FormField,
  ErrorAlert,
  ModalWrapper,
  ModalHeader,
  ModalFooter,
} from "./Shared";

interface ResetPasswordModalProps {
  userId: Id<"users">;
  username: string;
  onClose: () => void;
  actingUser: { userId: Id<"users">; username: string };
}

export function ResetPasswordModal({
  userId,
  username,
  onClose,
  actingUser,
}: ResetPasswordModalProps) {
  const { token } = useAuth();
  const resetPassword = useAction(api.usersActions.resetPassword);
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword({
        token: token!,
        id: userId,
        newPassword,
      });
      toast.success(`Password reset for "${username}"`);
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
        <ModalHeader title="Reset Password" onClose={onClose} />
        <div className="flex-1 p-6 space-y-5">
          {error && <ErrorAlert message={error} />}
          <p className="text-sm text-on-surface-variant font-bold">
            Set a new password for <span className="text-on-surface">@{username}</span>
          </p>
          <FormField label="New Password" htmlFor="newpwd">
            <input
              id="newpwd"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              placeholder="Minimum 4 characters"
              required
              minLength={4}
              disabled={submitting}
              autoFocus
              autoComplete="new-password"
            />
          </FormField>
        </div>
        <ModalFooter
          onClose={onClose}
          submitLabel="Reset Password"
          submitting={submitting}
        />
      </form>
    </ModalWrapper>
  );
}
