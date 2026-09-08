import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RecoveryAdmin = {
  isSuperAdmin: boolean;
  companyId: string | null;
  email: string | null;
};

export type AuditEntry = {
  id: string;
  action: string;
  actor_email: string | null;
  target_email: string | null;
  created_at: string;
  details: Record<string, string | number | boolean | null> | null;
};

async function writeAuditLog(entry: Parameters<
  typeof import("@/lib/recovery.server")["writeAuditLog"]
>[0]) {
  const helpers = await import("@/lib/recovery.server");
  return helpers.writeAuditLog(entry);
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Super Admin (platform-wide) or a company admin scoped to their own tenant. */
async function assertRecoveryAdmin(context: {
  supabase: { from: (t: string) => any };
  userId: string;
}): Promise<RecoveryAdmin> {
  const db = await admin();
  const { data: profile } = await db
    .from("profiles")
    .select("is_super_admin, company_id, email")
    .eq("id", context.userId)
    .maybeSingle();

  if (profile?.is_super_admin) {
    return { isSuperAdmin: true, companyId: profile.company_id ?? null, email: profile.email };
  }

  const { data: role } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();

  if (!role || !profile?.company_id) {
    throw new Error("Forbidden: account recovery is limited to administrators");
  }
  return { isSuperAdmin: false, companyId: profile.company_id, email: profile.email };
}

async function loadTarget(userId: string, scope: RecoveryAdmin) {
  const db = await admin();
  const { data: target } = await db
    .from("profiles")
    .select("id, email, full_name, company_id, is_super_admin, status, must_reset_password")
    .eq("id", userId)
    .maybeSingle();
  if (!target) throw new Error("User not found");
  if (!scope.isSuperAdmin) {
    if (target.is_super_admin) throw new Error("The Super Admin account is protected");
    if (target.company_id !== scope.companyId) throw new Error("User not found");
  }
  return target;
}

export type RecoverySearchResult = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  employee_id: string | null;
  mobile_number: string | null;
  must_reset_password: boolean;
  is_super_admin: boolean;
  locked: boolean;
};

export const searchRecoveryUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { term: string }) => input)
  .handler(async ({ data, context }): Promise<RecoverySearchResult[]> => {
    const scope = await assertRecoveryAdmin(context);
    const db = await admin();
    // Strip PostgREST filter metacharacters so the search text can never alter
    // the structure of the .or() filter below.
    const term = (data.term ?? "")
      .trim()
      .replace(/[,.()"'\\*:]/g, " ")
      .replace(/\s+/g, " ")
      .slice(0, 60)
      .trim();

    let query = db
      .from("profiles")
      .select("id, email, full_name, status, employee_id, mobile_number, must_reset_password, is_super_admin")
      .order("created_at", { ascending: false })
      .limit(25);
    if (!scope.isSuperAdmin) query = query.eq("company_id", scope.companyId!);
    if (term) {
      query = query.or(
        `email.ilike.%${term}%,full_name.ilike.%${term}%,employee_id.ilike.%${term}%,mobile_number.ilike.%${term}%`,
      );
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const { data: authList } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    const bannedById = new Map(
      (authList?.users ?? []).map((u) => [
        u.id,
        Boolean((u as { banned_until?: string | null }).banned_until),
      ]),
    );

    return (rows ?? []).map((r) => ({
      id: r.id,
      email: r.email ?? "",
      full_name: r.full_name ?? "",
      status: r.status ?? "Active",
      employee_id: r.employee_id ?? null,
      mobile_number: r.mobile_number ?? null,
      must_reset_password: Boolean(r.must_reset_password),
      is_super_admin: Boolean(r.is_super_admin),
      locked: bannedById.get(r.id) ?? false,
    }));
  });

export const adminSendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; origin: string }) => input)
  .handler(async ({ data, context }) => {
    const scope = await assertRecoveryAdmin(context);
    const target = await loadTarget(data.userId, scope);
    const db = await admin();

    let redirectTo: string;
    try {
      redirectTo = `${new URL(data.origin).origin}/reset-password`;
    } catch {
      throw new Error("Invalid application address");
    }

    const { error } = await db.auth.admin.generateLink({
      type: "recovery",
      email: target.email!,
      options: { redirectTo },
    });
    if (error) throw new Error(error.message);

    await writeAuditLog({
      action: "admin_password_reset_sent",
      companyId: target.company_id,
      actorId: context.userId,
      actorEmail: scope.email,
      targetUserId: target.id,
      targetEmail: target.email,
    });
    return { ok: true };
  });

export const adminForcePasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; force: boolean }) => input)
  .handler(async ({ data, context }) => {
    const scope = await assertRecoveryAdmin(context);
    const target = await loadTarget(data.userId, scope);
    const db = await admin();
    await db.from("profiles").update({ must_reset_password: data.force }).eq("id", target.id);
    await writeAuditLog({
      action: data.force ? "force_password_reset_enabled" : "force_password_reset_cleared",
      companyId: target.company_id,
      actorId: context.userId,
      actorEmail: scope.email,
      targetUserId: target.id,
      targetEmail: target.email,
    });
    return { ok: true };
  });

export const adminUpdateLoginId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; email: string }) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? "")) throw new Error("Valid email required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const scope = await assertRecoveryAdmin(context);
    const target = await loadTarget(data.userId, scope);
    const db = await admin();
    const email = data.email.trim().toLowerCase();

    const { error } = await db.auth.admin.updateUserById(target.id, { email, email_confirm: true });
    if (error) throw new Error(error.message);
    await db.from("profiles").update({ email }).eq("id", target.id);

    await writeAuditLog({
      action: "login_id_changed",
      companyId: target.company_id,
      actorId: context.userId,
      actorEmail: scope.email,
      targetUserId: target.id,
      targetEmail: email,
      details: { previousEmail: target.email },
    });
    return { ok: true };
  });

export const adminUpdateRecoveryDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; employeeId?: string | undefined; mobile?: string | undefined }) => input)
  .handler(async ({ data, context }) => {
    const scope = await assertRecoveryAdmin(context);
    const target = await loadTarget(data.userId, scope);
    const db = await admin();
    await db
      .from("profiles")
      .update({
        employee_id: data.employeeId?.trim() || null,
        mobile_number: data.mobile?.trim() || null,
      })
      .eq("id", target.id);
    await writeAuditLog({
      action: "recovery_identifiers_updated",
      companyId: target.company_id,
      actorId: context.userId,
      actorEmail: scope.email,
      targetUserId: target.id,
      targetEmail: target.email,
    });
    return { ok: true };
  });

export const adminSetAccountLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; locked: boolean }) => input)
  .handler(async ({ data, context }) => {
    const scope = await assertRecoveryAdmin(context);
    const target = await loadTarget(data.userId, scope);
    if (target.is_super_admin && data.locked) throw new Error("The Super Admin account is protected");
    const db = await admin();

    const { error } = await db.auth.admin.updateUserById(target.id, {
      ban_duration: data.locked ? "876000h" : "none",
    });
    if (error) throw new Error(error.message);
    await db
      .from("profiles")
      .update({ status: data.locked ? "Inactive" : "Active" })
      .eq("id", target.id);

    await writeAuditLog({
      action: data.locked ? "account_deactivated" : "account_unlocked",
      companyId: target.company_id,
      actorId: context.userId,
      actorEmail: scope.email,
      targetUserId: target.id,
      targetEmail: target.email,
    });
    return { ok: true };
  });

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AuditEntry[]> => {
    const scope = await assertRecoveryAdmin(context);
    const db = await admin();
    let query = db
      .from("security_audit_logs")
      .select("id, action, actor_email, target_email, created_at, details")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!scope.isSuperAdmin) query = query.eq("company_id", scope.companyId!);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as AuditEntry[];
  });

export const getRecoveryAdminScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecoveryAdmin | null> => {
    try {
      return await assertRecoveryAdmin(context);
    } catch {
      return null;
    }
  });
