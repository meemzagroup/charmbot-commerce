import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AppRole = "admin" | "store_manager" | "support_agent";
export const APP_ROLES: AppRole[] = ["admin", "store_manager", "support_agent"];

export type ManagedUser = {
  id: string;
  email: string;
  full_name: string;
  role: AppRole | null;
  status: "Active" | "Inactive";
  is_super_admin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

async function assertSuperAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.is_super_admin) throw new Error("Forbidden: Super Admin only");
}

export const listManagedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: authList, error: authError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (authError) throw new Error(authError.message);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, is_super_admin, status");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const roleById = new Map((roles ?? []).map((r) => [r.user_id, r.role as AppRole]));

    return authList.users.map((u) => {
      const p = profileById.get(u.id);
      const banned = Boolean((u as { banned_until?: string | null }).banned_until);
      return {
        id: u.id,
        email: u.email ?? "",
        full_name: p?.full_name ?? (u.user_metadata?.['full_name'] as string) ?? "",
        role: roleById.get(u.id) ?? null,
        status: banned || p?.status === "Inactive" ? "Inactive" : "Active",
        is_super_admin: Boolean(p?.is_super_admin),
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      } satisfies ManagedUser;
    });
  });

export const createManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fullName: string; email: string; password: string; role: AppRole }) => {
    if (!input.fullName?.trim()) throw new Error("Full name is required");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? "")) throw new Error("Valid email required");
    if ((input.password ?? "").length < 8) throw new Error("Temporary password must be 8+ characters");
    if (!APP_ROLES.includes(input.role)) throw new Error("Invalid role");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName.trim() },
    });
    if (error) throw new Error(error.message);
    const id = created.user.id;

    await supabaseAdmin
      .from("profiles")
      .upsert({ id, full_name: data.fullName.trim(), email: data.email.trim().toLowerCase(), status: "Active" });
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: id, role: data.role }, { onConflict: "user_id,role" });
    if (roleError) throw new Error(roleError.message);

    return { id };
  });

export const updateManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      userId: string;
      fullName?: string;
      role?: AppRole;
      status?: "Active" | "Inactive";
      password?: string;
    }) => {
      if (!input.userId) throw new Error("userId required");
      if (input.role && !APP_ROLES.includes(input.role)) throw new Error("Invalid role");
      if (input.password !== undefined && input.password.length < 8)
        throw new Error("Password must be 8+ characters");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("is_super_admin")
      .eq("id", data.userId)
      .maybeSingle();
    if (target?.is_super_admin && (data.status === "Inactive" || data.role))
      throw new Error("The Super Admin account cannot be deactivated or re-roled");

    if (data.password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        password: data.password,
      });
      if (error) throw new Error(error.message);
    }

    if (data.fullName !== undefined) {
      await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        user_metadata: { full_name: data.fullName.trim() },
      });
      await supabaseAdmin
        .from("profiles")
        .update({ full_name: data.fullName.trim() })
        .eq("id", data.userId);
    }

    if (data.status) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        ban_duration: data.status === "Inactive" ? "876000h" : "none",
      });
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("profiles").update({ status: data.status }).eq("id", data.userId);
    }

    if (data.role) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role });
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

export const deleteManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input.userId) throw new Error("userId required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("is_super_admin")
      .eq("id", data.userId)
      .maybeSingle();
    if (target?.is_super_admin) throw new Error("The Super Admin account cannot be deleted");

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", context.userId)
      .maybeSingle();
    return { isSuperAdmin: Boolean(data?.is_super_admin) };
  });
