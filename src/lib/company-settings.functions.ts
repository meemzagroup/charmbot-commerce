import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Company-level preferences a company admin may change (never subscription data). */
export const saveCompanyPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { language: string; currency: string }) => {
    if (!/^[a-z]{2}$/.test(input.language ?? "")) throw new Error("Invalid language");
    if (!/^[A-Z]{3}$/.test(input.currency ?? "")) throw new Error("Invalid currency");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, is_super_admin")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("No company assigned to this account");

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin && !profile.is_super_admin)
      throw new Error("Forbidden: company administrators only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("companies")
      .update({ language: data.language, currency: data.currency })
      .eq("id", profile.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Company admins may set their own company's logo (storage path or external URL). */
export const saveCompanyLogo = createServerFn({ method: "POST" })
  .inputValidator((input: { logoUrl: string | null }) => {
    const v = (input?.logoUrl ?? "").trim();
    if (v && !/^https?:\/\//i.test(v) && !/^[0-9a-f-]{36}\/[\w.-]{1,120}$/i.test(v))
      throw new Error("Invalid logo reference");
    return { logoUrl: v || null };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, is_super_admin")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("No company assigned to this account");

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow && !profile.is_super_admin)
      throw new Error("Forbidden: company administrators only");

    // A company admin may only reference an object inside their own company folder.
    if (data.logoUrl && !/^https?:\/\//i.test(data.logoUrl)) {
      const folder = data.logoUrl.split("/")[0];
      if (folder !== profile.company_id) throw new Error("Forbidden: other company's logo");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("companies")
      .update({ logo_url: data.logoUrl })
      .eq("id", profile.company_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCurrencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as { supabase: any };
    const { data, error } = await supabase
      .from("currencies")
      .select("code, name, symbol, decimals")
      .eq("is_active", true)
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });
