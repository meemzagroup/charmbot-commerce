import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Platform (SaaS owner) operations. Every function here re-verifies that the
 * caller is the platform Super Admin against the database — never from input.
 */

export const CRM_MODULES = [
  { key: "dashboard", label: "Dashboard / Overview" },
  { key: "orders", label: "Orders" },
  { key: "inbox", label: "Omnichannel Inbox" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "campaigns", label: "WhatsApp Campaigns" },
  { key: "email", label: "Email" },
  { key: "webchat", label: "Web Chat" },
  { key: "calls", label: "Call Logs" },
  { key: "customers", label: "Customers" },
  { key: "inventory", label: "Inventory" },
  { key: "inquiries", label: "Inquiries" },
  { key: "reports", label: "Reports" },
  { key: "ai", label: "AI Features" },
  { key: "integrations", label: "Integrations" },
  { key: "api", label: "API Access" },
  { key: "user_management", label: "User Management" },
  { key: "account_recovery", label: "Account Recovery" },
  { key: "settings", label: "Settings" },
] as const;

export type ModuleKey = (typeof CRM_MODULES)[number]["key"];

type Ctx = { supabase: any; userId: string; claims?: Record<string, unknown> };

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

async function audit(
  admin: any,
  actor: { id: string; email: string | null },
  action: string,
  extra: {
    targetType?: string;
    targetId?: string | null;
    companyId?: string | null;
    details?: Record<string, unknown>;
  } = {},
) {
  await admin.from("platform_audit_logs").insert({
    actor_id: actor.id,
    actor_email: actor.email,
    action,
    target_type: extra.targetType ?? null,
    target_id: extra.targetId ?? null,
    company_id: extra.companyId ?? null,
    details: extra.details ?? {},
  });
}

/* ------------------------------- companies ------------------------------- */

export type CompanyRow = {
  id: string;
  name: string;
  legal_name: string | null;
  company_code: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string;
  currency: string;
  language: string;
  tax_id: string | null;
  website: string | null;
  logo_url: string | null;
  status: string;
  is_archived: boolean;
  package_id: string | null;
  package_name: string | null;
  subscription_start: string | null;
  subscription_expiry: string | null;
  trial_ends_at: string | null;
  limit_overrides: Record<string, number>;
  created_at: string;
  user_count: number;
  channel_count: number;
  customer_count: number;
  order_count: number;
};

export const listCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanyRow[]> => {
    await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: companies }, { data: packages }, { data: profiles }, { data: channels }, { data: customers }, { data: orders }] =
      await Promise.all([
        supabaseAdmin.from("companies").select("*").order("created_at", { ascending: false }),
        supabaseAdmin.from("subscription_packages").select("id, name"),
        supabaseAdmin.from("profiles").select("id, company_id"),
        supabaseAdmin.from("whatsapp_channels").select("id, company_id"),
        supabaseAdmin.from("customers").select("id, company_id"),
        supabaseAdmin.from("orders").select("id, company_id"),
      ]);

    const pkgName = new Map((packages ?? []).map((p: any) => [p.id, p.name as string]));
    const count = (rows: any[] | null, id: string) =>
      (rows ?? []).filter((r) => r.company_id === id).length;

    return (companies ?? []).map((c: any) => ({
      ...c,
      package_name: c.package_id ? (pkgName.get(c.package_id) ?? null) : null,
      limit_overrides: c.limit_overrides ?? {},
      user_count: count(profiles, c.id),
      channel_count: count(channels, c.id),
      customer_count: count(customers, c.id),
      order_count: count(orders, c.id),
    })) as CompanyRow[];
  });

export type CompanyInput = {
  id?: string;
  name: string;
  legal_name?: string | null;
  company_code?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  timezone?: string;
  currency?: string;
  language?: string;
  tax_id?: string | null;
  website?: string | null;
  logo_url?: string | null;
  status?: string;
  package_id?: string | null;
  subscription_start?: string | null;
  subscription_expiry?: string | null;
  trial_ends_at?: string | null;
  limit_overrides?: Record<string, number>;
};

export const saveCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CompanyInput) => {
    if (!input?.name?.trim()) throw new Error("Company name is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const actor = await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const payload: any = {
      name: data.name.trim(),
      legal_name: data.legal_name ?? null,
      company_code: data.company_code?.trim() || null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      whatsapp: data.whatsapp ?? null,
      address: data.address ?? null,
      city: data.city ?? null,
      state: data.state ?? null,
      country: data.country ?? null,
      timezone: data.timezone || "Asia/Karachi",
      currency: data.currency || "PKR",
      language: data.language || "en",
      tax_id: data.tax_id ?? null,
      website: data.website ?? null,
      logo_url: data.logo_url ?? null,
      status: data.status || "Active",
      package_id: data.package_id || null,
      subscription_start: data.subscription_start || null,
      subscription_expiry: data.subscription_expiry || null,
      trial_ends_at: data.trial_ends_at || null,
      limit_overrides: data.limit_overrides ?? {},
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("companies").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(supabaseAdmin, { id: context.userId, email: actor.email }, "company.update", {
        targetType: "company",
        targetId: data.id,
        companyId: data.id,
        details: payload,
      });
      return { id: data.id };
    }

    const { data: created, error } = await supabaseAdmin
      .from("companies")
      // Legacy companies.api_key is deprecated and never written by app code.
      .insert({ ...payload, name: payload.name } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Integration credentials live only in the backend-only company_secrets table,
    // never on the companies row that company staff can read.
    await supabaseAdmin
      .from("company_secrets")
      .insert({ company_id: created.id, api_key: crypto.randomUUID() });
    await audit(supabaseAdmin, { id: context.userId, email: actor.email }, "company.create", {
      targetType: "company",
      targetId: created.id,
      companyId: created.id,
      details: { name: payload['name'] },
    });
    return { id: created.id as string };
  });

export const setCompanyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; status: "Active" | "Suspended" | "Archived" }) => {
    if (!input?.companyId) throw new Error("companyId required");
    if (!["Active", "Suspended", "Archived"].includes(input.status)) throw new Error("Invalid status");
    return input;
  })
  .handler(async ({ data, context }) => {
    const actor = await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("companies")
      .update({ status: data.status, is_archived: data.status === "Archived" })
      .eq("id", data.companyId);
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, { id: context.userId, email: actor.email }, "company.status", {
      targetType: "company",
      targetId: data.companyId,
      companyId: data.companyId,
      details: { status: data.status },
    });
    return { ok: true };
  });

/* -------------------------------- packages ------------------------------- */

export type PackageInput = {
  id?: string;
  name: string;
  description?: string | null;
  monthly_price?: number;
  annual_price?: number;
  currency?: string;
  trial_days?: number;
  max_users?: number | null;
  max_whatsapp_channels?: number | null;
  max_branches?: number | null;
  max_customers?: number | null;
  max_orders?: number | null;
  max_campaigns_per_month?: number | null;
  storage_mb?: number | null;
  ai_message_limit?: number | null;
  api_access?: boolean;
  support_level?: string;
  modules?: Record<string, boolean>;
  is_active?: boolean;
  is_archived?: boolean;
};

export const listPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("subscription_packages")
      .select("*")
      .order("monthly_price", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const savePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PackageInput) => {
    if (!input?.name?.trim()) throw new Error("Package name is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const actor = await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      name: data.name.trim(),
      description: data.description ?? null,
      monthly_price: data.monthly_price ?? 0,
      annual_price: data.annual_price ?? 0,
      currency: data.currency || "PKR",
      trial_days: data.trial_days ?? 0,
      max_users: data.max_users ?? null,
      max_whatsapp_channels: data.max_whatsapp_channels ?? null,
      max_branches: data.max_branches ?? null,
      max_customers: data.max_customers ?? null,
      max_orders: data.max_orders ?? null,
      max_campaigns_per_month: data.max_campaigns_per_month ?? null,
      storage_mb: data.storage_mb ?? null,
      ai_message_limit: data.ai_message_limit ?? null,
      api_access: data.api_access ?? false,
      support_level: data.support_level || "Standard",
      modules: data.modules ?? {},
      is_active: data.is_active ?? true,
      is_archived: data.is_archived ?? false,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("subscription_packages")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(supabaseAdmin, { id: context.userId, email: actor.email }, "package.update", {
        targetType: "package",
        targetId: data.id,
        details: { name: payload.name },
      });
      return { id: data.id };
    }
    const { data: created, error } = await supabaseAdmin
      .from("subscription_packages")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(supabaseAdmin, { id: context.userId, email: actor.email }, "package.create", {
      targetType: "package",
      targetId: created.id,
      details: { name: payload.name },
    });
    return { id: created.id as string };
  });

export const duplicatePackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { packageId: string }) => {
    if (!input?.packageId) throw new Error("packageId required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const actor = await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: src, error } = await supabaseAdmin
      .from("subscription_packages")
      .select("*")
      .eq("id", data.packageId)
      .single();
    if (error) throw new Error(error.message);
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = src as any;
    const { data: created, error: insErr } = await supabaseAdmin
      .from("subscription_packages")
      .insert({ ...rest, name: `${src.name} (Copy)`, is_active: false })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    await audit(supabaseAdmin, { id: context.userId, email: actor.email }, "package.duplicate", {
      targetType: "package",
      targetId: created.id,
    });
    return { id: created.id as string };
  });

/* ------------------------------- dashboard -------------------------------- */

export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: companies }, { data: profiles }, { data: packages }] = await Promise.all([
      supabaseAdmin.from("companies").select("*"),
      supabaseAdmin.from("profiles").select("id, company_id, status"),
      supabaseAdmin.from("subscription_packages").select("id, name, monthly_price, annual_price"),
    ]);
    const now = Date.now();
    const list = companies ?? [];
    const expired = list.filter(
      (c: any) => c.subscription_expiry && new Date(c.subscription_expiry).getTime() < now,
    );
    const pkgById = new Map((packages ?? []).map((p: any) => [p.id, p]));
    const distribution = (packages ?? []).map((p: any) => ({
      name: p.name as string,
      count: list.filter((c: any) => c.package_id === p.id).length,
    }));
    const mrr = list
      .filter((c: any) => c.status === "Active")
      .reduce((sum: number, c: any) => sum + Number(pkgById.get(c.package_id)?.monthly_price ?? 0), 0);

    return {
      totalCompanies: list.length,
      activeCompanies: list.filter((c: any) => c.status === "Active" && !c.is_archived).length,
      trialCompanies: list.filter(
        (c: any) => c.trial_ends_at && new Date(c.trial_ends_at).getTime() > now,
      ).length,
      suspendedCompanies: list.filter((c: any) => c.status === "Suspended").length,
      expiredSubscriptions: expired.length,
      totalUsers: (profiles ?? []).length,
      activeSubscriptions: list.filter(
        (c: any) =>
          c.status === "Active" &&
          (!c.subscription_expiry || new Date(c.subscription_expiry).getTime() > now),
      ).length,
      mrr,
      arr: mrr * 12,
      distribution,
      recentCompanies: [...list]
        .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 5)
        .map((c: any) => ({ id: c.id, name: c.name, created_at: c.created_at, status: c.status })),
      upcomingExpirations: list
        .filter(
          (c: any) =>
            c.subscription_expiry &&
            new Date(c.subscription_expiry).getTime() > now &&
            new Date(c.subscription_expiry).getTime() < now + 30 * 864e5,
        )
        .map((c: any) => ({ id: c.id, name: c.name, expiry: c.subscription_expiry })),
      alerts: [
        ...expired.map((c: any) => ({ level: "error", text: `${c.name}: subscription expired` })),
        ...list
          .filter((c: any) => !c.package_id)
          .map((c: any) => ({ level: "warn", text: `${c.name}: no package assigned` })),
      ],
    };
  });

export const listPlatformAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("platform_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listCompanyUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => {
    if (!input?.companyId) throw new Error("companyId required");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, status, is_super_admin, created_at")
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
