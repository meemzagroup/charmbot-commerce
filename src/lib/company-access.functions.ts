import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Company onboarding / access management. Only the platform owner (Super Admin)
 * may call these. Temporary passwords are generated here, returned exactly once
 * to the caller, and never stored anywhere in plaintext.
 */

type Ctx = { supabase: any; userId: string };

async function assertPlatformOwner(context: Ctx) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("is_super_admin, email")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.is_super_admin) throw new Error("Forbidden: platform owner only");
  return { email: (data.email as string | null) ?? null };
}

export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const symbols = "!@#$%&*";
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  let out = "";
  for (let i = 0; i < 11; i++) out += alphabet[bytes[i]! % alphabet.length];
  out += symbols[bytes[11]! % symbols.length];
  return out;
}

export type CompanyAccess = {
  companyId: string;
  companyName: string;
  fullName: string;
  email: string;
  tempPassword: string;
  packageName: string | null;
  subscriptionExpiry: string | null;
};

async function audit(
  admin: any,
  actor: { id: string; email: string | null },
  action: string,
  extra: { companyId?: string | null; targetId?: string | null; details?: Record<string, unknown> } = {},
) {
  await admin.from("platform_audit_logs").insert({
    actor_id: actor.id,
    actor_email: actor.email,
    action,
    target_type: "company_user",
    target_id: extra.targetId ?? null,
    company_id: extra.companyId ?? null,
    details: extra.details ?? {},
  });
}

export type ProvisionInput = {
  companyId: string;
  fullName: string;
  email: string;
  mobile?: string | null;
  password?: string | null;
};

/** Create (or re-provision) a company admin for a tenant company. */
export const provisionCompanyAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ProvisionInput) => {
    if (!input?.companyId) throw new Error("companyId is required");
    if (!input.fullName?.trim()) throw new Error("Company admin full name is required");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? "")) throw new Error("A valid admin email is required");
    if (input.password && input.password.length < 8)
      throw new Error("Temporary password must be at least 8 characters");
    return input;
  })
  .handler(async ({ data, context }): Promise<CompanyAccess> => {
    const actor = await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, name, subscription_expiry, package_id")
      .eq("id", data.companyId)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    if (!company) throw new Error("Company not found");

    let packageName: string | null = null;
    if (company.package_id) {
      const { data: pkg } = await supabaseAdmin
        .from("subscription_packages")
        .select("name")
        .eq("id", company.package_id)
        .maybeSingle();
      packageName = (pkg?.name as string) ?? null;
    }

    // Subscription user limit is enforced server-side.
    const { data: limit } = await supabaseAdmin.rpc("company_limit", {
      _company_id: company.id,
      _key: "max_users",
    });
    if (limit !== null && limit !== undefined) {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id);
      if ((count ?? 0) >= Number(limit))
        throw new Error(`User limit reached for this subscription package (${limit} users).`);
    }

    const email = data.email.trim().toLowerCase();
    const fullName = data.fullName.trim();
    const tempPassword = data.password?.trim() || generateTempPassword();

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) {
      throw new Error(
        /already/i.test(error.message)
          ? "That email already has an account. Use Manage Access to reset its password instead."
          : error.message,
      );
    }
    const userId = created.user.id;

    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      full_name: fullName,
      email,
      mobile_number: data.mobile?.trim() || null,
      company_id: company.id,
      status: "Active",
      must_reset_password: true,
      is_super_admin: false,
    });
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    if (roleError) throw new Error(roleError.message);

    await audit(supabaseAdmin, { id: context.userId, email: actor.email }, "company_admin.create", {
      companyId: company.id,
      targetId: userId,
      details: { email },
    });

    return {
      companyId: company.id,
      companyName: company.name as string,
      fullName,
      email,
      tempPassword,
      packageName,
      subscriptionExpiry: (company.subscription_expiry as string | null) ?? null,
    };
  });

export type CompanyAdminRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  mobile_number: string | null;
  status: string;
  role: string | null;
  must_reset_password: boolean;
  created_at: string;
};

export const listCompanyAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => {
    if (!input?.companyId) throw new Error("companyId required");
    return input;
  })
  .handler(async ({ data, context }): Promise<CompanyAdminRow[]> => {
    await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, mobile_number, status, must_reset_password, created_at")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: any) => r.id);
    const { data: roles } = ids.length
      ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as any[] };
    const roleById = new Map((roles ?? []).map((r: any) => [r.user_id, r.role as string]));

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      mobile_number: r.mobile_number,
      status: r.status ?? "Active",
      role: roleById.get(r.id) ?? null,
      must_reset_password: Boolean(r.must_reset_password),
      created_at: r.created_at,
    }));
  });

/** Issue a fresh temporary password. Returned once; nothing is stored in plaintext. */
export const resetCompanyUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password?: string | null }) => {
    if (!input?.userId) throw new Error("userId required");
    if (input.password && input.password.length < 8)
      throw new Error("Temporary password must be at least 8 characters");
    return input;
  })
  .handler(async ({ data, context }) => {
    const actor = await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, company_id, is_super_admin")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target) throw new Error("User not found");
    if (target.is_super_admin) throw new Error("The platform owner account is protected");

    const tempPassword = data.password?.trim() || generateTempPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: tempPassword,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ must_reset_password: true }).eq("id", data.userId);

    await audit(supabaseAdmin, { id: context.userId, email: actor.email }, "company_admin.reset_password", {
      companyId: target.company_id,
      targetId: target.id,
    });

    return {
      email: (target.email as string) ?? "",
      fullName: (target.full_name as string) ?? "",
      tempPassword,
    };
  });

export const setCompanyUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; active: boolean }) => {
    if (!input?.userId) throw new Error("userId required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const actor = await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id, is_super_admin")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target) throw new Error("User not found");
    if (target.is_super_admin) throw new Error("The platform owner account is protected");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({ status: data.active ? "Active" : "Inactive" })
      .eq("id", data.userId);

    await audit(supabaseAdmin, { id: context.userId, email: actor.email }, "company_admin.set_active", {
      companyId: target.company_id,
      targetId: target.id,
      details: { active: data.active },
    });
    return { ok: true };
  });
