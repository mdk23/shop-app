"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistance } from "date-fns";
import { cn } from "@/lib/utils";
import { Shield, Monitor, Smartphone, Trash2, Users as UsersIcon } from "lucide-react";
import { Role, ROLE_CONFIG, ActionBtn, LoadingSpinner } from "./Shared";

interface ActiveSessionsTableProps {
  activeSessions: any[] | undefined;
  onTerminateSession: (session: any) => void;
}

export function ActiveSessionsTable({
  activeSessions,
  onTerminateSession,
}: ActiveSessionsTableProps) {
  return (
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
                            onClick={() => onTerminateSession(session)}
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
  );
}
