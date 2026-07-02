"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit2,
  UserCheck,
  UserX,
  KeyRound,
  X,
  Search,
  Shield,
  Users as UsersIcon,
  Eye,
  AlertCircle,
  Check,
  Trash2,
  Monitor,
  Smartphone,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistance } from "date-fns";

type Role = "admin" | "manager" | "pos_seller";

const ROLE_CONFIG: Record<
  Role,
  { label: string; color: string; bg: string; border: string }
> = {
  admin: {
    label: "Admin",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
  },
  manager: {
    label: "Manager",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  pos_seller: {
    label: "POS Seller",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
};

// ─────────────────────────────────────────────
// MODAL — Create / Edit User
// ─────────────────────────────────────────────
function UserFormModal({
  user,
  onClose,
  actingUser,
}: {
  user?: { _id: Id<"users">; name: string; username: string; role: Role };
  onClose: () => void;
  actingUser: { userId: Id<"users">; username: string; role: Role };
}) {
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
                          : "POS & Caixa only"}
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

// ─────────────────────────────────────────────
// MODAL — Reset Password
// ─────────────────────────────────────────────
function ResetPasswordModal({
  userId,
  username,
  onClose,
  actingUser,
}: {
  userId: Id<"users">;
  username: string;
  onClose: () => void;
  actingUser: { userId: Id<"users">; username: string };
}) {
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

// ─────────────────────────────────────────────
// MODAL — Activity (Audit Log)
// ─────────────────────────────────────────────
function ActivityModal({
  userId,
  username,
  onClose,
}: {
  userId: Id<"users">;
  username: string;
  onClose: () => void;
}) {
  const logs = useQuery(api.auth.getAuditLogsByUser, { userId, limit: 30 });

  return (
    <ModalWrapper onClose={onClose}>
      <div className="flex flex-col h-full max-h-[80vh]">
        <ModalHeader title={`Activity — @${username}`} onClose={onClose} />
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {logs === undefined ? (
            <LoadingSpinner />
          ) : logs.length === 0 ? (
            <p className="text-on-surface-variant text-sm font-bold text-center py-8">
              No activity recorded
            </p>
          ) : (
            logs.map((log) => (
              <div
                key={log._id}
                className="p-4 bg-surface-container-low rounded-xl border border-outline-variant"
              >
                <div className="flex justify-between items-start gap-2">
                  <p className="text-xs font-black text-on-surface uppercase tracking-wider">
                    {log.action.replace(/_/g, " ")}
                  </p>
                  <p className="text-[10px] text-on-surface-variant font-bold whitespace-nowrap shrink-0">
                    {formatDistance(log.createdAt, Date.now(), { addSuffix: true })}
                  </p>
                </div>
                {log.details && (
                  <p className="text-xs text-on-surface-variant mt-1 font-medium">
                    {log.details}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t-2 border-outline">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl border-2 border-outline font-black text-xs uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
function UsersPageContent() {
  const { currentUser, token } = useAuth();
  const users = useQuery(api.users.list);
  const setStatus = useMutation(api.users.setStatus);

  const [activeTab, setActiveTab] = useState<"users" | "sessions">("users");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<any>(null);
  const [activityUser, setActivityUser] = useState<any>(null);
  const [confirmDisable, setConfirmDisable] = useState<any>(null);
  const [confirmTerminate, setConfirmTerminate] = useState<any>(null);

  const activeSessions = useQuery(api.auth.listActiveSessions, { token: token! });
  const terminateSession = useMutation(api.auth.terminateSession);

  if (!currentUser) return null;

  const actingUser = {
    userId: currentUser.userId,
    username: currentUser.username,
    role: currentUser.role,
  };

  const filteredUsers = (users ?? []).filter((u) => {
    // Managers only see pos_sellers
    if (currentUser.role === "manager" && u.role !== "pos_seller") return false;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.role.includes(q)
    );
  });

  const handleToggleStatus = async (user: any) => {
    const newStatus = user.status === "active" ? "disabled" : "active";
    try {
      await setStatus({
        token: token!,
        id: user._id,
        status: newStatus,
      });
      toast.success(
        `User "${user.username}" ${newStatus === "active" ? "enabled" : "disabled"}`
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
    setConfirmDisable(null);
  };

  const handleTerminateSession = async (sessionId: Id<"userSessions">, username: string) => {
    try {
      await terminateSession({
        token: token!,
        sessionId,
      });
      toast.success(`Session terminated for @${username}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to terminate session");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display text-on-surface">User Management</h1>
          <p className="text-sm font-bold text-on-surface-variant mt-1">
            {activeTab === "users" ? (
              `${filteredUsers.length} user${filteredUsers.length !== 1 ? "s" : ""} found`
            ) : (
              `${(activeSessions ?? []).length} active session${(activeSessions ?? []).length !== 1 ? "s" : ""} found`
            )}
          </p>
        </div>
        {activeTab === "users" && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-primary text-on-primary rounded-xl font-black text-xs uppercase tracking-widest hover:bg-secondary transition-colors shadow-hard"
            id="create-user-btn"
          >
            <Plus className="w-4 h-4" />
            New User
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b-2 border-outline pb-2">
        <button
          onClick={() => setActiveTab("users")}
          className={cn(
            "px-4 py-2 font-black text-xs uppercase tracking-widest border-2 rounded-xl transition-all",
            activeTab === "users"
              ? "bg-surface border-primary text-primary shadow-hard-sm"
              : "bg-surface-container-low border-transparent text-on-surface-variant hover:text-on-surface"
          )}
        >
          Users
        </button>
        <button
          onClick={() => setActiveTab("sessions")}
          className={cn(
            "px-4 py-2 font-black text-xs uppercase tracking-widest border-2 rounded-xl transition-all",
            activeTab === "sessions"
              ? "bg-surface border-primary text-primary shadow-hard-sm"
              : "bg-surface-container-low border-transparent text-on-surface-variant hover:text-on-surface"
          )}
        >
          Active Sessions
        </button>
      </div>

      {activeTab === "users" ? (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, username or role..."
              className="w-full pl-10 pr-4 py-3 bg-surface border-2 border-outline rounded-xl font-bold text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-all"
              id="user-search"
            />
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(["admin", "manager", "pos_seller"] as Role[]).map((role) => {
              const count = (users ?? []).filter((u) => u.role === role).length;
              const cfg = ROLE_CONFIG[role];
              return (
                <div
                  key={role}
                  className={cn(
                    "p-4 rounded-2xl border-2 flex items-center gap-3",
                    cfg.bg,
                    cfg.border
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", cfg.bg)}>
                    <UsersIcon className={cn("w-5 h-5", cfg.color)} />
                  </div>
                  <div>
                    <p className={cn("text-2xl font-display", cfg.color)}>{count}</p>
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                      {cfg.label}
                    </p>
                  </div>
                </div>
              );
            })}
            <div className="p-4 rounded-2xl border-2 border-outline bg-surface-container-low flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center">
                <UserX className="w-5 h-5 text-on-surface-variant" />
              </div>
              <div>
                <p className="text-2xl font-display text-on-surface">
                  {(users ?? []).filter((u) => u.status === "disabled").length}
                </p>
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  Disabled
                </p>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-surface border-2 border-outline rounded-2xl overflow-hidden shadow-hard">
            {users === undefined ? (
              <div className="p-12 flex justify-center">
                <LoadingSpinner />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center">
                <UsersIcon className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
                <p className="font-black text-on-surface-variant">No users found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-outline bg-surface-container-low">
                      {["Name", "Username", "Role", "Status", "Created", "Last Login", "Actions"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-left text-[10px] font-black text-on-surface-variant uppercase tracking-widest"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence initial={false}>
                      {filteredUsers.map((user) => {
                        const cfg = ROLE_CONFIG[user.role as Role];
                        return (
                          <motion.tr
                            key={user._id}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="border-b border-outline-variant hover:bg-surface-container-low/50 transition-colors"
                          >
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "w-9 h-9 rounded-lg flex items-center justify-center font-display text-base shrink-0",
                                    cfg.bg,
                                    cfg.color
                                  )}
                                >
                                  {user.name.slice(0, 1).toUpperCase()}
                                </div>
                                <p className="font-black text-sm text-on-surface">{user.name}</p>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm font-bold text-on-surface-variant">
                                @{user.username}
                              </p>
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                  cfg.bg,
                                  cfg.color,
                                  cfg.border
                                )}
                              >
                                <Shield className="w-3 h-3" />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                                  user.status === "active"
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "bg-surface-container-high text-on-surface-variant"
                                )}
                              >
                                {user.status === "active" ? (
                                  <UserCheck className="w-3 h-3" />
                                ) : (
                                  <UserX className="w-3 h-3" />
                                )}
                                {user.status}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-xs font-bold text-on-surface-variant">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-4 text-xs font-bold text-on-surface-variant">
                              {user.lastLogin
                                ? formatDistance(user.lastLogin, Date.now(), { addSuffix: true })
                                : "Never"}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-1">
                                <ActionBtn
                                  icon={<Edit2 className="w-3.5 h-3.5" />}
                                  label="Edit"
                                  onClick={() => setEditingUser(user)}
                                />
                                <ActionBtn
                                  icon={<KeyRound className="w-3.5 h-3.5" />}
                                  label="Reset PW"
                                  onClick={() => setResetPasswordUser(user)}
                                />
                                <ActionBtn
                                  icon={<Eye className="w-3.5 h-3.5" />}
                                  label="Activity"
                                  onClick={() => setActivityUser(user)}
                                />
                                {/* Can't disable yourself */}
                                {user._id !== currentUser.userId && (
                                  <ActionBtn
                                    icon={
                                      user.status === "active" ? (
                                        <UserX className="w-3.5 h-3.5" />
                                      ) : (
                                        <UserCheck className="w-3.5 h-3.5" />
                                      )
                                    }
                                    label={user.status === "active" ? "Disable" : "Enable"}
                                    danger={user.status === "active"}
                                    onClick={() => setConfirmDisable(user)}
                                  />
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Active Sessions Table */
        <div className="bg-surface border-2 border-outline rounded-2xl overflow-hidden shadow-hard">
          {activeSessions === undefined ? (
            <div className="p-12 flex justify-center">
              <LoadingSpinner />
            </div>
          ) : activeSessions.length === 0 ? (
            <div className="p-12 text-center">
              <UsersIcon className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="font-black text-on-surface-variant">No active sessions found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-outline bg-surface-container-low">
                    {["User", "Role", "Device / Browser", "Login Time", "Last Active", "Actions"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left text-[10px] font-black text-on-surface-variant uppercase tracking-widest"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence initial={false}>
                    {activeSessions.map((session) => {
                      const cfg = ROLE_CONFIG[session.role as Role];
                      return (
                        <motion.tr
                          key={session.sessionId}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          className={cn(
                            "border-b border-outline-variant hover:bg-surface-container-low/50 transition-colors",
                            session.isCurrent && "bg-primary/5"
                          )}
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  "w-9 h-9 rounded-lg flex items-center justify-center font-display text-base shrink-0",
                                  cfg.bg,
                                  cfg.color
                                )}
                              >
                                {session.name.slice(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-black text-sm text-on-surface">
                                  {session.name}
                                  {session.isCurrent && (
                                    <span className="ml-2 text-[10px] font-black uppercase bg-primary text-on-primary px-1.5 py-0.5 rounded">
                                      You
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-on-surface-variant">@{session.username}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                cfg.bg,
                                cfg.color,
                                cfg.border
                              )}
                            >
                              <Shield className="w-3 h-3" />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              {session.device === "Mobile" ? (
                                <Smartphone className="w-4 h-4 text-on-surface-variant" />
                              ) : session.device === "Tablet" ? (
                                <Smartphone className="w-4 h-4 text-on-surface-variant rotate-90" />
                              ) : (
                                <Monitor className="w-4 h-4 text-on-surface-variant" />
                              )}
                              <div>
                                <p className="text-sm font-bold text-on-surface">
                                  {session.browser}
                                </p>
                                <p className="text-[10px] text-on-surface-variant truncate max-w-[200px]">
                                  {session.device}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs font-bold text-on-surface-variant">
                            {formatDistance(session.createdAt, Date.now(), { addSuffix: true })}
                          </td>
                          <td className="px-4 py-4 text-xs font-bold text-on-surface-variant">
                            {formatDistance(session.lastActivity, Date.now(), { addSuffix: true })}
                          </td>
                          <td className="px-4 py-4">
                            {!session.isCurrent && (
                              <ActionBtn
                                icon={<Trash2 className="w-3.5 h-3.5" />}
                                label="Force Logout"
                                danger
                                onClick={() => setConfirmTerminate(session)}
                              />
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <UserFormModal
          onClose={() => setShowCreateModal(false)}
          actingUser={actingUser}
        />
      )}
      {editingUser && (
        <UserFormModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          actingUser={actingUser}
        />
      )}
      {resetPasswordUser && (
        <ResetPasswordModal
          userId={resetPasswordUser._id}
          username={resetPasswordUser.username}
          onClose={() => setResetPasswordUser(null)}
          actingUser={actingUser}
        />
      )}
      {activityUser && (
        <ActivityModal
          userId={activityUser._id}
          username={activityUser.username}
          onClose={() => setActivityUser(null)}
        />
      )}

      {/* Confirm disable/enable */}
      {confirmDisable && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface border-2 border-outline rounded-2xl p-6 max-w-sm w-full shadow-hard-lg"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-error/10 flex items-center justify-center">
                {confirmDisable.status === "active" ? (
                  <UserX className="w-6 h-6 text-error" />
                ) : (
                  <UserCheck className="w-6 h-6 text-emerald-500" />
                )}
              </div>
              <div>
                <p className="font-black text-on-surface">
                  {confirmDisable.status === "active" ? "Disable" : "Enable"} User?
                </p>
                <p className="text-sm text-on-surface-variant font-bold">
                  @{confirmDisable.username}
                </p>
              </div>
            </div>
            <p className="text-sm text-on-surface-variant mb-6">
              {confirmDisable.status === "active"
                ? "This user will be immediately logged out and won't be able to access the system."
                : "This user will be able to log in again."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDisable(null)}
                className="flex-1 py-3 rounded-xl border-2 border-outline font-black text-xs uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleToggleStatus(confirmDisable)}
                className={cn(
                  "flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all",
                  confirmDisable.status === "active"
                    ? "bg-error text-on-error hover:opacity-90"
                    : "bg-emerald-500 text-white hover:opacity-90"
                )}
              >
                {confirmDisable.status === "active" ? "Disable" : "Enable"}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Confirm terminate session */}
      {confirmTerminate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface border-2 border-outline rounded-2xl p-6 max-w-sm w-full shadow-hard-lg"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-error/10 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-error" />
              </div>
              <div>
                <p className="font-black text-on-surface">Force Logout?</p>
                <p className="text-sm text-on-surface-variant font-bold">
                  @{confirmTerminate.username}
                </p>
              </div>
            </div>
            <p className="text-sm text-on-surface-variant mb-6">
              Are you sure you want to terminate this session remotely? The user will be instantly logged out.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmTerminate(null)}
                className="flex-1 py-3 rounded-xl border-2 border-outline font-black text-xs uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleTerminateSession(confirmTerminate.sessionId, confirmTerminate.username);
                  setConfirmTerminate(null);
                }}
                className="flex-1 py-3 rounded-xl bg-error text-on-error font-black text-xs uppercase tracking-widest transition-all hover:opacity-90"
              >
                Terminate
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────

const inputClass =
  "w-full px-4 py-3 bg-surface-container-low border-2 border-outline rounded-xl font-bold text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-all text-sm";

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-black text-on-surface uppercase tracking-widest"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-error/10 border border-error/30 rounded-xl">
      <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
      <p className="text-error text-sm font-bold">{message}</p>
    </div>
  );
}

function ModalWrapper({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="bg-surface border-2 border-outline rounded-2xl w-full max-w-lg shadow-hard-lg overflow-hidden max-h-[90vh] flex flex-col"
      >
        {children}
      </motion.div>
    </div>
  );
}

function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="p-6 border-b-2 border-outline flex items-center justify-between bg-surface-container-low shrink-0">
      <h2 className="text-xl font-display text-on-surface">{title}</h2>
      <button
        onClick={onClose}
        className="w-8 h-8 rounded-lg border border-outline flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ModalFooter({
  onClose,
  submitLabel,
  submitting,
}: {
  onClose: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  return (
    <div className="p-6 border-t-2 border-outline flex gap-3 shrink-0 bg-surface-container-low/30">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 py-3 rounded-xl border-2 border-outline font-black text-xs uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all"
        disabled={submitting}
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="flex-1 py-3 rounded-xl bg-primary text-on-primary font-black text-xs uppercase tracking-widest hover:bg-secondary transition-colors shadow-hard disabled:opacity-50"
      >
        {submitting ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "w-8 h-8 rounded-lg border flex items-center justify-center transition-all",
        danger
          ? "border-error/30 text-error hover:bg-error/10"
          : "border-outline text-on-surface-variant hover:text-primary hover:border-primary hover:bg-primary/5"
      )}
    >
      {icon}
    </button>
  );
}

function LoadingSpinner() {
  return (
    <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
  );
}

// ─────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────
export default function UsersPage() {
  return (
    <AuthGuard requiredRoles={["admin", "manager"]}>
      <PageLayout>
        <UsersPageContent />
      </PageLayout>
    </AuthGuard>
  );
}
