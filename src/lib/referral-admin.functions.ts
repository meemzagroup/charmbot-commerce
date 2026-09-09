import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

async function assertPlatformOwner(context: Ctx) {
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", context.userId)
    .maybeSingle();
  if (!profile?.is_super_admin) throw new Error("Forbidden: platform owner only");
}

export type ReferralProgram = {
  enabled: boolean;
  reward_type: string;
  reward_value: number;
  qualification: string;
  requires_approval: boolean;
  terms: string | null;
};

export const getReferralProgram = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReferralProgram> => {
    await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("referral_program_settings")
      .select("enabled, reward_type, reward_value, qualification, requires_approval, terms")
      .eq("id", true)
      .maybeSingle();
    return {
      enabled: Boolean(data?.enabled),
      reward_type: data?.reward_type ?? "subscription_extension",
      reward_value: Number(data?.reward_value ?? 0),
      qualification: data?.qualification ?? "company_activated",
      requires_approval: Boolean(data?.requires_approval ?? true),
      terms: data?.terms ?? null,
    };
  });

export const saveReferralProgram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ReferralProgram) => {
    const types = ["subscription_extension", "bonus_seat", "feature_upgrade", "account_credit"];
    if (!types.includes(input.reward_type)) throw new Error("Invalid reward type");
    if (!Number.isFinite(Number(input.reward_value)) || Number(input.reward_value) < 0)
      throw new Error("Reward value must be zero or more");
    if ((input.terms ?? "").length > 1000) throw new Error("Terms are too long");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("referral_program_settings")
      .update({
        enabled: data.enabled,
        reward_type: data.reward_type,
        reward_value: Number(data.reward_value),
        qualification: data.qualification,
        requires_approval: data.requires_approval,
        terms: data.terms?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ReferralAnalytics = {
  totalInvitations: number;
  acceptedInvitations: number;
  totalReferrals: number;
  successfulReferrals: number;
  conversionRate: number;
  pendingRewards: number;
  completedRewards: number;
  topReferrers: { name: string; company: string | null; joined: number }[];
  recent: {
    id: string;
    code: string;
    status: string;
    reward_status: string;
    created_at: string;
  }[];
};

export const getReferralAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReferralAnalytics> => {
    await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: invites }, { data: referrals }] = await Promise.all([
      supabaseAdmin.from("invitations").select("status"),
      supabaseAdmin
        .from("referrals")
        .select("id, code, status, reward_status, referrer_user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const inviteRows = invites ?? [];
    const rows = referrals ?? [];
    const successful = rows.filter((r) => ["Joined", "Activated"].includes(r.status as string));

    const byUser = new Map<string, number>();
    for (const r of successful) {
      if (!r.referrer_user_id) continue;
      byUser.set(r.referrer_user_id, (byUser.get(r.referrer_user_id) ?? 0) + 1);
    }
    const topIds = [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const { data: profiles } = topIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, full_name, email, company_id")
          .in(
            "id",
            topIds.map(([id]) => id),
          )
      : { data: [] as any[] };
    const { data: companies } = await supabaseAdmin.from("companies").select("id, name");
    const companyName = new Map((companies ?? []).map((c) => [c.id, c.name as string]));

    return {
      totalInvitations: inviteRows.length,
      acceptedInvitations: inviteRows.filter((i) =>
        ["Accepted", "Joined", "Activated"].includes(i.status as string),
      ).length,
      totalReferrals: rows.length,
      successfulReferrals: successful.length,
      conversionRate: rows.length ? Math.round((successful.length / rows.length) * 100) : 0,
      pendingRewards: rows.filter((r) => r.reward_status === "Pending").length,
      completedRewards: rows.filter((r) => r.reward_status === "Granted").length,
      topReferrers: topIds.map(([id, joined]) => {
        const p = (profiles ?? []).find((x) => x.id === id);
        return {
          name: (p?.full_name as string) || (p?.email as string) || "Member",
          company: p?.company_id ? (companyName.get(p.company_id) ?? null) : null,
          joined,
        };
      }),
      recent: rows.slice(0, 20).map((r) => ({
        id: r.id as string,
        code: r.code as string,
        status: r.status as string,
        reward_status: r.reward_status as string,
        created_at: r.created_at as string,
      })),
    };
  });

/** Platform owner approves or declines an individual referral reward. */
export const setReferralReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; reward_status: "None" | "Pending" | "Granted" }) => {
    if (!input.id) throw new Error("id required");
    if (!["None", "Pending", "Granted"].includes(input.reward_status))
      throw new Error("Invalid reward status");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("referrals")
      .update({ reward_status: data.reward_status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PlatformBrand = {
  logoUrl: string | null;
  faviconUrl: string | null;
  pwaIconUrl: string | null;
  emailLogoUrl: string | null;
};

const BRAND_KEYS: Record<keyof PlatformBrand, string> = {
  logoUrl: "brand_logo_url",
  faviconUrl: "brand_favicon_url",
  pwaIconUrl: "brand_pwa_icon_url",
  emailLogoUrl: "brand_email_logo_url",
};

/** Public: the product brand assets used everywhere Manuta CRM is shown. */
export const getPlatformBrand = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformBrand> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", Object.values(BRAND_KEYS));
    const map = new Map((data ?? []).map((r) => [r.key as string, r.value as string | null]));
    return {
      logoUrl: map.get(BRAND_KEYS.logoUrl) || null,
      faviconUrl: map.get(BRAND_KEYS.faviconUrl) || null,
      pwaIconUrl: map.get(BRAND_KEYS.pwaIconUrl) || null,
      emailLogoUrl: map.get(BRAND_KEYS.emailLogoUrl) || null,
    };
  },
);

export const savePlatformBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: PlatformBrand) => {
    for (const value of Object.values(input)) {
      if (value && !/^https:\/\/[\w.-]+\//i.test(value))
        throw new Error("Brand asset URLs must be full https addresses");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertPlatformOwner(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (const [field, key] of Object.entries(BRAND_KEYS) as [keyof PlatformBrand, string][]) {
      const { error } = await supabaseAdmin
        .from("app_settings")
        .upsert(
          { key, value: data[field]?.trim() || null, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
