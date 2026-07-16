"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Plus,
  UserCheck,
  UserX,
  Search,
  Users as UsersIcon,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Extracted Sub-components
import { Role, ROLE_CONFIG, LoadingSpinner } from "@/components/users/Shared";
import { UserFormModal } from "@/components/users/UserFormModal";
import { ResetPasswordModal } from "@/components/users/ResetPasswordModal";
import { ActivityModal } from "@/components/users/ActivityModal";
import { UserTable } from "@/components/users/UserTable";
import { ActiveSessionsTable } from "@/components/users/ActiveSessionsTable";

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
    role: currentUser.role as Role,
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

          {/* Users Table */}
          <UserTable
            users={users}
            filteredUsers={filteredUsers}
            currentUser={currentUser}
            onEdit={setEditingUser}
            onResetPassword={setResetPasswordUser}
            onActivity={setActivityUser}
            onToggleStatus={setConfirmDisable}
          />
        </>
      ) : (
        /* Active Sessions Table */
        <ActiveSessionsTable
          activeSessions={activeSessions}
          onTerminateSession={setConfirmTerminate}
        />
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

export default function UsersPage() {
  return (
    <AuthGuard requiredRoles={["admin", "manager"]}>
      <PageLayout>
        <UsersPageContent />
      </PageLayout>
    </AuthGuard>
  );
}
