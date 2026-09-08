"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import {
  Card,
  Button,
  Field,
  Select,
  TextInput,
  Modal,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Spinner,
  Toolbar,
  StatCard,
  ConfirmDialog,
  inputClass,
} from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { toast } from "sonner";
import { Plus, Search, Pencil, KeyRound } from "lucide-react";

type User = {
  _id: Id<"users">;
  name: string;
  username: string;
  role: UserRole;
  status: "active" | "disabled";
  lastLogin?: number;
};

function Content() {
  const { currentUser } = useAuth();
  const token = useToken();
  const users = useQuery(api.users.list);
  const setStatus = useMutation(api.users.setStatus);
  const sessions = useQuery(api.auth.listActiveSessions, { token });
  const terminate = useMutation(api.auth.terminateSession);

  const [tab, setTab] = useState<"users" | "sessions">("users");
  const [search, setSearch] = useState("");
  const [modalUser, setModalUser] = useState<User | "new" | null>(null);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<User | null>(null);
  const [confirmKill, setConfirmKill] =
    useState<{ sessionId: Id<"userSessions">; username: string } | null>(null);

  const isManager = currentUser?.role === "manager";

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ((users ?? []) as User[]).filter(
      (u) =>
        (!isManager || u.role === "pos_seller") &&
        (u.name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.role.includes(q))
    );
  }, [users, search, isManager]);

  const counts = useMemo(() => {
    const c = { admin: 0, manager: 0, pos_seller: 0, disabled: 0 };
    for (const u of (users ?? []) as User[]) {
      c[u.role] += 1;
      if (u.status === "disabled") c.disabled += 1;
    }
    return c;
  }, [users]);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Admins" value={counts.admin} />
        <StatCard label="Managers" value={counts.manager} />
        <StatCard label="POS sellers" value={counts.pos_seller} />
        <StatCard label="Disabled" value={counts.disabled} accent={counts.disabled ? "error" : "primary"} />
      </div>

      <Toolbar>
        {(["users", "sessions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors " +
              (tab === t
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface-container-low text-on-surface-variant border-outline")
            }
          >
            {t === "users" ? "Users" : "Active sessions"}
          </button>
        ))}
        {tab === "users" && (
          <>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                className={`${inputClass} pl-9 w-56`}
                placeholder="Search users…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="ml-auto" />
            <Button onClick={() => setModalUser("new")}>
              <Plus className="w-3.5 h-3.5" /> New User
            </Button>
          </>
        )}
      </Toolbar>

      <Card>
        {tab === "users" ? (
          users === undefined ? (
            <Spinner />
          ) : filtered.length === 0 ? (
            <EmptyState title="No users" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Username</Th>
                  <Th>Role</Th>
                  <Th>Status</Th>
                  <Th>Last login</Th>
                  <Th className="w-32" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u._id} className="hover:bg-surface-container-low">
                    <Td className="font-bold">{u.name}</Td>
                    <Td className="text-on-surface-variant">@{u.username}</Td>
                    <Td>
                      <Badge tone="info">{u.role.replace("_", " ")}</Badge>
                    </Td>
                    <Td>
                      <button onClick={() => setConfirmToggle(u)}>
                        <Badge tone={u.status === "active" ? "success" : "error"}>
                          {u.status}
                        </Badge>
                      </button>
                    </Td>
                    <Td className="text-xs text-on-surface-variant">
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : "—"}
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setModalUser(u)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setResetUser(u)}>
                          <KeyRound className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        ) : sessions === undefined ? (
          <Spinner />
        ) : sessions.length === 0 ? (
          <EmptyState title="No active sessions" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Device</Th>
                <Th>Last activity</Th>
                <Th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.sessionId} className="hover:bg-surface-container-low">
                  <Td className="font-bold">
                    {s.name}{" "}
                    {s.isCurrent && <Badge tone="info">this device</Badge>}
                  </Td>
                  <Td>{s.role.replace("_", " ")}</Td>
                  <Td className="text-on-surface-variant text-xs">
                    {s.browser} · {s.device}
                  </Td>
                  <Td className="text-xs text-on-surface-variant">
                    {new Date(s.lastActivity).toLocaleString()}
                  </Td>
                  <Td>
                    {!s.isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setConfirmKill({ sessionId: s.sessionId, username: s.username })
                        }
                      >
                        Force out
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {modalUser && (
        <UserModal
          token={token}
          isManager={isManager}
          user={modalUser === "new" ? null : modalUser}
          onClose={() => setModalUser(null)}
        />
      )}
      {resetUser && (
        <ResetModal
          token={token}
          user={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}
      <ConfirmDialog
        open={!!confirmToggle}
        onClose={() => setConfirmToggle(null)}
        title={confirmToggle?.status === "active" ? "Disable user" : "Enable user"}
        message={
          confirmToggle?.status === "active"
            ? `@${confirmToggle?.username} will be logged out immediately.`
            : `@${confirmToggle?.username} will be able to log in again.`
        }
        danger={confirmToggle?.status === "active"}
        confirmLabel={confirmToggle?.status === "active" ? "Disable" : "Enable"}
        onConfirm={async () => {
          if (!confirmToggle) return;
          try {
            await setStatus({
              token,
              id: confirmToggle._id,
              status: confirmToggle.status === "active" ? "disabled" : "active",
            });
            toast.success("Updated");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
          setConfirmToggle(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmKill}
        onClose={() => setConfirmKill(null)}
        title="Force logout"
        message={`Terminate the session for @${confirmKill?.username}?`}
        danger
        confirmLabel="Terminate"
        onConfirm={async () => {
          if (!confirmKill) return;
          try {
            await terminate({ token, sessionId: confirmKill.sessionId });
            toast.success("Session terminated");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
          setConfirmKill(null);
        }}
      />
    </>
  );
}

function UserModal({
  token,
  user,
  isManager,
  onClose,
}: {
  token: string;
  user: User | null;
  isManager: boolean;
  onClose: () => void;
}) {
  const createUser = useAction(api.usersActions.createUser);
  const updateUser = useMutation(api.users.update);
  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(user?.role ?? "pos_seller");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required.");
    setBusy(true);
    try {
      if (user) {
        await updateUser({ token, id: user._id, name, role });
      } else {
        if (!username.trim() || password.length < 4)
          return toast.error("Username and a 4+ char password are required.");
        await createUser({ token, name, username, password, role });
      }
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={user ? "Edit User" : "New User"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Full name" required>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      {!user && (
        <>
          <Field label="Username" required>
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Password" required hint="At least 4 characters">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </>
      )}
      <Field label="Role">
        <Select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          disabled={isManager}
        >
          {(isManager ? (["pos_seller"] as const) : (["admin", "manager", "pos_seller"] as const)).map(
            (r) => (
              <option key={r} value={r}>
                {r.replace("_", " ")}
              </option>
            )
          )}
        </Select>
      </Field>
    </Modal>
  );
}

function ResetModal({
  token,
  user,
  onClose,
}: {
  token: string;
  user: User;
  onClose: () => void;
}) {
  const reset = useAction(api.usersActions.resetPassword);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Reset password · @${user.username}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (pw.length < 4) return toast.error("At least 4 characters.");
              setBusy(true);
              try {
                await reset({ token, id: user._id, newPassword: pw });
                toast.success("Password reset");
                onClose();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed");
              } finally {
                setBusy(false);
              }
            }}
            loading={busy}
          >
            Reset
          </Button>
        </>
      }
    >
      <Field label="New password" required>
        <TextInput type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
    </Modal>
  );
}

export default function UsersPage() {
  return (
    <AuthGuard requiredRoles={["admin", "manager"]}>
      <PageLayout title="Users" subtitle="Administration · accounts & sessions">
        <Content />
      </PageLayout>
    </AuthGuard>
  );
}
