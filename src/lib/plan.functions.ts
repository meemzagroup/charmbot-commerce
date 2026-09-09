import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CompanyPlan = {
  companyId: string | null;
  companyName: string | null;
  logoUrl: string | null;
  isSuperAdmin: boolean;
  status: string;
  active: boolean;
  expiry: string | null;
  trialEndsAt: string | null;
  currency: string;
  language: string;
  packageName: string | null;
  modules: Record<string, boolean>;
  limits: {
    max_users: number | null;
    max_whatsapp_channels: number | null;
    max_customers: number | null;
    max_orders: number | null;
    max_campaigns_per_month: number | null;
  };
  usage: { users: number; channels: number };
};

/** Resolves the authenticated user's own company plan. Never trusts input. */
export const getMyPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanyPlan> => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id, is_super_admin")
      .eq("id", userId)
      .maybeSingle();

    const empty: CompanyPlan = {
      companyId: null,
      companyName: null,
      logoUrl: null,
      isSuperAdmin: Boolean(profile?.is_super_admin),
      status: "Active",
      active: true,
      expiry: null,
      trialEndsAt: null,
      currency: "PKR",
      language: "en",
      packageName: null,
      modules: {},
      limits: {
        max_users: null,
        max_whatsapp_channels: null,
        max_customers: null,
        max_orders: null,
        max_campaigns_per_month: null,
      },
      usage: { users: 0, channels: 0 },
    };
    if (!profile?.company_id) return empty;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select(
        "id, name, logo_url, status, is_archived, subscription_expiry, trial_ends_at, currency, language, limit_overrides, package_id",
      )
      .eq("id", profile.company_id)
      .maybeSingle();
    if (!company) return empty;

    // Logos live in a private bucket; sign a short-lived URL for this company only.
    let logoUrl: string | null = null;
    const logoRef = company.logo_url as string | null;
    if (logoRef && /^https?:\/\//i.test(logoRef)) {
      logoUrl = logoRef;
    } else if (logoRef) {
      const { data: signed } = await supabaseAdmin.storage
        .from("company-logos")
        .createSignedUrl(logoRef, 3600);
      logoUrl = signed?.signedUrl ?? null;
    }


    const { data: pkg } = company.package_id
      ? await supabaseAdmin
          .from("subscription_packages")
          .select("*")
          .eq("id", company.package_id)
          .maybeSingle()
      : { data: null as any };

    const [{ count: users }, { count: channels }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id),
      supabaseAdmin
        .from("whatsapp_channels")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id),
    ]);

    const ov = (company.limit_overrides ?? {}) as Record<string, number>;
    const lim = (key: string, base: number | null | undefined) =>
      ov[key] !== undefined && ov[key] !== null ? Number(ov[key]) : (base ?? null);

    const expiry = company.subscription_expiry as string | null;
    return {
      companyId: company.id,
      companyName: company.name,
      logoUrl,
      isSuperAdmin: Boolean(profile.is_super_admin),
      status: company.status,
      active:
        company.status === "Active" &&
        !company.is_archived &&
        (!expiry || new Date(expiry).getTime() > Date.now()),
      expiry,
      trialEndsAt: company.trial_ends_at,
      currency: company.currency ?? "PKR",
      language: company.language ?? "en",
      packageName: pkg?.name ?? null,
      modules: (pkg?.modules ?? {}) as Record<string, boolean>,
      limits: {
        max_users: lim("max_users", pkg?.max_users),
        max_whatsapp_channels: lim("max_whatsapp_channels", pkg?.max_whatsapp_channels),
        max_customers: lim("max_customers", pkg?.max_customers),
        max_orders: lim("max_orders", pkg?.max_orders),
        max_campaigns_per_month: lim("max_campaigns_per_month", pkg?.max_campaigns_per_month),
      },
      usage: { users: users ?? 0, channels: channels ?? 0 },
    };
  });

/** Server-side gate helpers reused by other server functions. */
export async function assertCompanyModule(
  supabaseClient: any,
  userId: string,
  moduleKey: string,
) {
  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("company_id, is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.is_super_admin) return;
  if (!profile?.company_id) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: ok } = await supabaseAdmin.rpc("company_module_enabled", {
    _company_id: profile.company_id,
    _module: moduleKey,
  });
  if (ok === false) throw new Error(`Upgrade required: this feature is not in your subscription package`);
  const { data: active } = await supabaseAdmin.rpc("company_subscription_active", {
    _company_id: profile.company_id,
  });
  if (active === false)
    throw new Error("Subscription expired — contact administrator / renew subscription.");
}
