"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { formatDistance } from "date-fns";
import { ModalWrapper, ModalHeader, LoadingSpinner } from "./Shared";

interface ActivityModalProps {
  userId: Id<"users">;
  username: string;
  onClose: () => void;
}

export function ActivityModal({ userId, username, onClose }: ActivityModalProps) {
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
