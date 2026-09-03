import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import {
  APP_ROLES,
  createManagedUser,
  deleteManagedUser,
  getMyAdminStatus,
  listManagedUsers,
  updateManagedUser,
  type AppRole,
} from "@/lib/admin-users.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  store_manager: "Store Manager",
  support_agent: "Support Agent",
};

const selectClass = "h-9 rounded-md bg-panel2 border border-line px-2.5 text-xs text-foreground";

export function UserManagementSection() {
  const status = useServerFn(getMyAdminStatus);
  const { data: me } = useQuery({ queryKey: ["my-admin-status"], queryFn: () => status({}) });
  if (!me?.isSuperAdmin) return null;
  return <UserManagementPanel />;
}

function UserManagementPanel() {
  const queryClient = useQueryClient();
  const list = useServerFn(listManagedUsers);
  const create = useServerFn(createManagedUser);
  const update = useServerFn(updateManagedUser);
  const remove = useServerFn(deleteManagedUser);

  const { data: users = [] } = useQuery({ queryKey: ["managed-users"], queryFn: () => list({}) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["managed-users"] });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("support_agent");

  const addUser = useMutation({
    mutationFn: () => create({ data: { fullName, email, password, role } }),
    onSuccess: () => {
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("support_agent");
      invalidate();
      toast.success("User created", { description: "Share the temporary password securely." });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: (p: {
      userId: string;
      fullName?: string;
      role?: AppRole;
      status?: "Active" | "Inactive";
      password?: string;
    }) => update({ data: p }),
    onSuccess: () => {
      invalidate();
      toast.success("User updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (userId: string) => remove({ data: { userId } }),
    onSuccess: () => {
      invalidate();
      toast.success("User deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg bg-panel border border-line p-6 space-y-5">
      <div>
        <h2 className="display-title text-xl flex items-center gap-2">
          <ShieldCheck className="size-4 text-teal" /> Team &amp; User Management
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Super Admin only. Public sign-up is disabled — every account is created here.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto] items-end">
        <div className="space-y-2">
          <Label htmlFor="nu_name">Full name</Label>
          <Input id="nu_name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="bg-panel2" placeholder="Ayesha Rahman" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nu_email">Email</Label>
          <Input id="nu_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-panel2" placeholder="ayesha@meemza.pk" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nu_pass">Temporary password</Label>
          <Input id="nu_pass" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-panel2" placeholder="min 8 characters" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nu_role">Role</Label>
          <select id="nu_role" className={selectClass} value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
            {APP_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <Button onClick={() => addUser.mutate()} disabled={addUser.isPending}>
          <UserPlus className="size-4" /> Create
        </Button>
      </div>

      <div className="rounded-md border border-line divide-y divide-line/60">
        {users.length === 0 && (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">No users yet.</div>
        )}
        {users.map((u) => (
          <div key={u.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate flex items-center gap-2">
                {u.full_name || "—"}
                {u.is_super_admin && (
                  <span className="text-[10px] uppercase tracking-wide text-teal border border-teal/40 rounded px-1.5 py-0.5">
                    Super Admin
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{u.email}</div>
            </div>

            <select
              className={`${selectClass} ml-auto`}
              value={u.role ?? ""}
              disabled={u.is_super_admin}
              onChange={(e) => patch.mutate({ userId: u.id, role: e.target.value as AppRole })}
            >
              <option value="" disabled>No role</option>
              {APP_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>

            <Button
              variant="outline"
              size="sm"
              disabled={u.is_super_admin}
              onClick={() =>
                patch.mutate({ userId: u.id, status: u.status === "Active" ? "Inactive" : "Active" })
              }
            >
              {u.status}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const pw = window.prompt(`New password for ${u.email} (min 8 characters)`);
                if (pw) patch.mutate({ userId: u.id, password: pw });
              }}
            >
              <KeyRound className="size-4" /> Reset password
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const name = window.prompt("Full name", u.full_name);
                if (name !== null) patch.mutate({ userId: u.id, fullName: name });
              }}
            >
              Edit
            </Button>

            <Button
              variant="ghost"
              size="icon"
              disabled={u.is_super_admin}
              onClick={() => {
                if (window.confirm(`Delete ${u.email}? This cannot be undone.`)) del.mutate(u.id);
              }}
            >
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
