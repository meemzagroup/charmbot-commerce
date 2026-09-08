import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound, Lock, LockOpen, Mail, Search, ShieldCheck, UserCog } from "lucide-react";
import {
  adminForcePasswordReset,
  adminSendPasswordReset,
  adminSetAccountLock,
  adminUpdateLoginId,
  adminUpdateRecoveryDetails,
  getRecoveryAdminScope,
  listAuditLog,
  searchRecoveryUsers,
} from "@/lib/admin-recovery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACTION_LABEL: Record<string, string> = {
  password_reset_requested: "Password reset requested",
  password_reset_completed: "Password reset completed",
  login_id_recovery_attempt: "Login ID recovery attempt",
  admin_password_reset_sent: "Admin sent password reset",
  force_password_reset_enabled: "Forced password reset on next sign-in",
  force_password_reset_cleared: "Cleared forced password reset",
  login_id_changed: "Login ID changed",
  recovery_identifiers_updated: "Recovery details updated",
  account_deactivated: "Account deactivated",
  account_unlocked: "Account unlocked",
};

export function AccountRecoveryAdmin() {
  const queryClient = useQueryClient();
  const scopeFn = useServerFn(getRecoveryAdminScope);
  const searchFn = useServerFn(searchRecoveryUsers);
  const sendReset = useServerFn(adminSendPasswordReset);
  const forceReset = useServerFn(adminForcePasswordReset);
  const setLock = useServerFn(adminSetAccountLock);
  const setLoginId = useServerFn(adminUpdateLoginId);
  const setDetails = useServerFn(adminUpdateRecoveryDetails);
  const auditFn = useServerFn(listAuditLog);

  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");

  const { data: scope, isLoading } = useQuery({
    queryKey: ["recovery-scope"],
    queryFn: () => scopeFn({}),
  });
  const { data: users = [] } = useQuery({
    queryKey: ["recovery-users", query],
    queryFn: () => searchFn({ data: { term: query } }),
    enabled: Boolean(scope),
  });
  const { data: audit = [] } = useQuery({
    queryKey: ["recovery-audit"],
    queryFn: () => auditFn({}),
    enabled: Boolean(scope),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["recovery-users"] });
    queryClient.invalidateQueries({ queryKey: ["recovery-audit"] });
  };

  const run = useMutation({
    mutationFn: async (task: () => Promise<unknown>) => task(),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return null;
  if (!scope) {
    return (
      <div className="max-w-lg rounded-lg bg-panel border border-line p-8">
        <h1 className="display-title text-2xl">Restricted area</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Account recovery is available to company administrators and the Super Admin only.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-panel border border-line p-6 space-y-5">
        <div>
          <h1 className="display-title text-xl flex items-center gap-2">
            <UserCog className="size-4 text-teal" /> Account Recovery
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Find a team member, view or change their login ID, send a reset link, force a new
            password, unlock or deactivate the account. Existing passwords can never be viewed.
          </p>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(term);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              aria-label="Search users by name, email, employee ID or mobile"
              className="pl-9 bg-panel2"
              placeholder="Search by name, email, employee ID or mobile"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <Button type="submit">Search</Button>
        </form>

        <div className="rounded-md border border-line divide-y divide-line/60">
          {users.length === 0 && (
            <div className="px-4 py-8 text-sm text-muted-foreground text-center">
              No matching accounts.
            </div>
          )}
          {users.map((u) => (
            <div key={u.id} className="px-4 py-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {u.full_name || "—"}
                    {u.is_super_admin && (
                      <span className="text-[10px] uppercase tracking-wide text-teal border border-teal/40 rounded px-1.5 py-0.5">
                        Super Admin
                      </span>
                    )}
                    {u.must_reset_password && (
                      <span className="text-[10px] uppercase tracking-wide text-amber-400 border border-amber-400/40 rounded px-1.5 py-0.5">
                        Reset pending
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Login ID: <span className="font-mono">{u.email}</span>
                    {u.employee_id ? ` · ${u.employee_id}` : ""}
                    {u.mobile_number ? ` · ${u.mobile_number}` : ""}
                  </div>
                </div>

                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      run.mutate(async () => {
                        await sendReset({
                          data: { userId: u.id, origin: window.location.origin },
                        });
                        toast.success("Password reset link sent");
                      })
                    }
                  >
                    <Mail className="size-4" /> Send reset link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      run.mutate(async () => {
                        await forceReset({
                          data: { userId: u.id, force: !u.must_reset_password },
                        });
                        toast.success(
                          u.must_reset_password
                            ? "Forced reset cleared"
                            : "User must set a new password at next sign-in",
                        );
                      })
                    }
                  >
                    <KeyRound className="size-4" />
                    {u.must_reset_password ? "Cancel forced reset" : "Force reset"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={u.is_super_admin}
                    onClick={() =>
                      run.mutate(async () => {
                        await setLock({ data: { userId: u.id, locked: !u.locked && u.status === "Active" } });
                        toast.success("Account status updated");
                      })
                    }
                  >
                    {u.locked || u.status === "Inactive" ? (
                      <>
                        <LockOpen className="size-4" /> Unlock / activate
                      </>
                    ) : (
                      <>
                        <Lock className="size-4" /> Deactivate
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const email = window.prompt("New login ID (email)", u.email);
                      if (email)
                        run.mutate(async () => {
                          await setLoginId({ data: { userId: u.id, email } });
                          toast.success("Login ID updated");
                        });
                    }}
                  >
                    Change login ID
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end">
                <div className="space-y-1">
                  <Label htmlFor={`emp_${u.id}`} className="text-xs">
                    Employee ID
                  </Label>
                  <Input
                    id={`emp_${u.id}`}
                    defaultValue={u.employee_id ?? ""}
                    className="bg-panel2 h-9"
                    placeholder="EMP-014"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`mob_${u.id}`} className="text-xs">
                    Registered mobile
                  </Label>
                  <Input
                    id={`mob_${u.id}`}
                    defaultValue={u.mobile_number ?? ""}
                    className="bg-panel2 h-9"
                    placeholder="+92 300 1234567"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const employeeId = (
                      document.getElementById(`emp_${u.id}`) as HTMLInputElement | null
                    )?.value;
                    const mobile = (
                      document.getElementById(`mob_${u.id}`) as HTMLInputElement | null
                    )?.value;
                    run.mutate(async () => {
                      await setDetails({ data: { userId: u.id, employeeId, mobile } });
                      toast.success("Recovery details saved");
                    });
                  }}
                >
                  Save recovery details
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-panel border border-line p-6">
        <h2 className="display-title text-lg flex items-center gap-2">
          <ShieldCheck className="size-4 text-teal" /> Security audit log
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Password resets, login ID changes, recovery attempts and account unlocks.
        </p>
        <div className="mt-4 rounded-md border border-line divide-y divide-line/60 max-h-96 overflow-auto">
          {audit.length === 0 && (
            <div className="px-4 py-8 text-sm text-muted-foreground text-center">
              No recovery activity recorded yet.
            </div>
          )}
          {audit.map((entry) => (
            <div key={entry.id} className="px-4 py-3 text-sm flex flex-wrap gap-x-3 gap-y-1">
              <span className="font-medium">{ACTION_LABEL[entry.action] ?? entry.action}</span>
              <span className="text-muted-foreground">{entry.target_email ?? "—"}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString()}
                {entry.actor_email ? ` · by ${entry.actor_email}` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
