"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistance } from "date-fns";
import { cn } from "@/lib/utils";
import { Shield, UserCheck, UserX, Edit2, KeyRound, Eye, Users as UsersIcon } from "lucide-react";
import { Role, ROLE_CONFIG, ActionBtn, LoadingSpinner } from "./Shared";

interface UserTableProps {
  users: any[] | undefined;
  filteredUsers: any[];
  currentUser: any;
  onEdit: (user: any) => void;
  onResetPassword: (user: any) => void;
  onActivity: (user: any) => void;
  onToggleStatus: (user: any) => void;
}

export function UserTable({
  users,
  filteredUsers,
  currentUser,
  onEdit,
  onResetPassword,
  onActivity,
  onToggleStatus,
}: UserTableProps) {
  return (
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
                            onClick={() => onEdit(user)}
                          />
                          <ActionBtn
                            icon={<KeyRound className="w-3.5 h-3.5" />}
                            label="Reset PW"
                            onClick={() => onResetPassword(user)}
                          />
                          <ActionBtn
                            icon={<Eye className="w-3.5 h-3.5" />}
                            label="Activity"
                            onClick={() => onActivity(user)}
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
                              onClick={() => onToggleStatus(user)}
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
  );
}
