import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InviteRole = "admin" | "store_manager" | "support_agent";
const ROLES: InviteRole[] = ["admin", "store_manager", "support_agent"];

export type InviteRow = {
  id: string;
  email: string;
  full_name: string | null;
  role_title: string;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

export type ReferralSummary = {
  code: string;
  link: string;
  invited: number;
  joined: number;
  activated: number;
  rewardsEarned: number;
  program: {
    enabled: boolean;
    reward_type: string;
    reward_value: number;
    qualification: string;
    requires_approval: boolean;
    terms: string | null;
  };
};

type Ctx = { supabase: any; userId: string };

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(bytes = 32) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(raw)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(raw)
    .map((b) => alphabet[b % alphabet.length])
    .join("");
}

/** Only company admins (or the platform owner acting in a company) may invite. */
async function resolveInviterScope(context: Ctx) {
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("company_id, is_super_admin, full_name")
    .eq("id", context.userId)
    .maybeSingle();
  if (profile?.is_super_admin)
    return { isSuperAdmin: true, companyId: (profile.company_id as string | null) ?? null };
  const { data: role } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!role || !profile?.company_id) throw new Error("Forbidden: administrators only");
  return { isSuperAdmin: false, companyId: profile.company_id as string };
}

export const listInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InviteRow[]> => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("invitations")
      .select("id, email, full_name, role_title, status, created_at, expires_at, accepted_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as InviteRow[];
  });

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      fullName: string;
      email: string;
      role: InviteRole;
      message?: string;
      origin: string;
    }) => {
      if (!input.fullName?.trim()) throw new Error("Name is required");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? ""))
        throw new Error("A valid email address is required");
      if (!ROLES.includes(input.role)) throw new Error("Invalid role");
      if ((input.message ?? "").length > 500) throw new Error("Message is too long");
      if (!/^https?:\/\//i.test(input.origin ?? "")) throw new Error("Invalid origin");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const scope = await resolveInviterScope(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const companyId = scope.companyId;
    if (!companyId) throw new Error("Your account is not assigned to a company workspace");

    const { data: active } = await supabaseAdmin.rpc("company_subscription_active", {
      _company_id: companyId,
    });
    if (active === false)
      throw new Error("Subscription expired — contact administrator / renew subscription.");

    // Seat limit: existing members + still-open invitations must stay within the package.
    const { data: limit } = await supabaseAdmin.rpc("company_limit", {
      _company_id: companyId,
      _key: "max_users",
    });
    if (limit !== null && limit !== undefined) {
      const [{ count: members }, { count: pending }] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabaseAdmin
          .from("invitations")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .in("status", ["Invited", "Opened"]),
      ]);
      if ((members ?? 0) + (pending ?? 0) >= Number(limit))
        throw new Error(
          `Seat limit reached for your subscription package (${limit} users, including pending invitations). Upgrade required.`,
        );
    }

    const email = data.email.trim().toLowerCase();
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, company_id")
      .eq("email", email)
      .maybeSingle();
    if (existingProfile) throw new Error("That email already has a Manuta CRM account");

    // Any earlier open invitation for this address is superseded.
    await supabaseAdmin
      .from("invitations")
      .update({ status: "Expired", updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .in("status", ["Invited", "Opened"])
      .eq("email", email);

    const token = randomToken();
    const { error } = await supabaseAdmin.from("invitations").insert({
      company_id: companyId,
      email,
      full_name: data.fullName.trim(),
      role_title: data.role,
      personal_message: data.message?.trim() || null,
      token_hash: await sha256(token),
      invited_by: (context as Ctx).userId,
      status: "Invited",
    });
    if (error) throw new Error(error.message);

    const origin = new URL(data.origin).origin;
    return { inviteUrl: `${origin}/join/${token}`, email };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => {
    if (!input.id) throw new Error("id required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const scope = await resolveInviterScope(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("invitations")
      .update({ status: "Expired", updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (!scope.isSuperAdmin) q = q.eq("company_id", scope.companyId!);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public: shows only the minimum needed to render the acceptance page. */
export const getInvitation = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => {
    if (!/^[a-f0-9]{32,128}$/.test(input.token ?? "")) throw new Error("Invalid invitation link");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("invitations")
      .select("id, email, full_name, role_title, personal_message, status, expires_at, company_id")
      .eq("token_hash", await sha256(data.token))
      .maybeSingle();
    if (!invite) return { valid: false as const, reason: "This invitation link is not valid." };
    if (invite.status === "Accepted" || invite.status === "Joined")
      return { valid: false as const, reason: "This invitation has already been used." };
    if (invite.status === "Expired" || new Date(invite.expires_at).getTime() < Date.now())
      return { valid: false as const, reason: "This invitation has expired." };

    if (invite.status === "Invited") {
      await supabaseAdmin
        .from("invitations")
        .update({ status: "Opened", opened_at: new Date().toISOString() })
        .eq("id", invite.id);
    }

    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("name")
      .eq("id", invite.company_id)
      .maybeSingle();

    return {
      valid: true as const,
      email: invite.email as string,
      fullName: (invite.full_name as string | null) ?? "",
      role: invite.role_title as string,
      message: (invite.personal_message as string | null) ?? null,
      companyName: (company?.name as string | null) ?? "your team",
    };
  });

/** Public: creates the account exactly as the invitation defines it. */
export const acceptInvitation = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; fullName: string; password: string }) => {
    if (!/^[a-f0-9]{32,128}$/.test(input.token ?? "")) throw new Error("Invalid invitation link");
    if (!input.fullName?.trim()) throw new Error("Please enter your name");
    if ((input.password ?? "").length < 8) throw new Error("Password must be at least 8 characters");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tokenHash = await sha256(data.token);
    const { data: invite } = await supabaseAdmin
      .from("invitations")
      .select("id, email, role_title, company_id, status, expires_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!invite || !["Invited", "Opened"].includes(invite.status as string))
      throw new Error("This invitation link is no longer valid.");
    if (new Date(invite.expires_at as string).getTime() < Date.now()) {
      await supabaseAdmin.from("invitations").update({ status: "Expired" }).eq("id", invite.id);
      throw new Error("This invitation has expired. Ask your administrator to send a new one.");
    }

    // Re-check the seat limit at the moment of acceptance.
    const { data: limit } = await supabaseAdmin.rpc("company_limit", {
      _company_id: invite.company_id,
      _key: "max_users",
    });
    if (limit !== null && limit !== undefined) {
      const { count } = await supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("company_id", invite.company_id);
      if ((count ?? 0) >= Number(limit))
        throw new Error("This workspace has reached its user limit. Contact your administrator.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email as string,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName.trim() },
    });
    if (error) throw new Error(error.message);
    const id = created.user.id;

    await supabaseAdmin.from("profiles").upsert({
      id,
      full_name: data.fullName.trim(),
      email: invite.email,
      company_id: invite.company_id,
      status: "Active",
      must_reset_password: false,
    });
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: id, role: invite.role_title }, { onConflict: "user_id,role" });

    await supabaseAdmin
      .from("invitations")
      .update({
        status: "Joined",
        accepted_at: new Date().toISOString(),
        activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    return { email: invite.email as string };
  });

/** Referral code + progress for the signed-in user. */
export const getMyReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { origin: string }) => {
    if (!/^https?:\/\//i.test(input.origin ?? "")) throw new Error("Invalid origin");
    return input;
  })
  .handler(async ({ data, context }): Promise<ReferralSummary> => {
    const { userId } = context as Ctx;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();

    let { data: row } = await supabaseAdmin
      .from("referral_codes")
      .select("code")
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) {
      for (let attempt = 0; attempt < 5 && !row; attempt++) {
        const candidate = randomCode();
        const { data: inserted } = await supabaseAdmin
          .from("referral_codes")
          .insert({ user_id: userId, company_id: profile?.company_id ?? null, code: candidate })
          .select("code")
          .maybeSingle();
        row = inserted ?? null;
      }
    }
    if (!row) throw new Error("Could not create a referral link right now");

    const { data: referrals } = await supabaseAdmin
      .from("referrals")
      .select("status, reward_status")
      .eq("referrer_user_id", userId);
    const list = referrals ?? [];
    const { data: program } = await supabaseAdmin
      .from("referral_program_settings")
      .select("enabled, reward_type, reward_value, qualification, requires_approval, terms")
      .eq("id", true)
      .maybeSingle();

    const origin = new URL(data.origin).origin;
    return {
      code: row.code as string,
      link: `${origin}/r/${row.code}`,
      invited: list.length,
      joined: list.filter((r) => ["Joined", "Activated"].includes(r.status as string)).length,
      activated: list.filter((r) => r.status === "Activated").length,
      rewardsEarned: list.filter((r) => r.reward_status === "Granted").length,
      program: {
        enabled: Boolean(program?.enabled),
        reward_type: (program?.reward_type as string) ?? "subscription_extension",
        reward_value: Number(program?.reward_value ?? 0),
        qualification: (program?.qualification as string) ?? "company_activated",
        requires_approval: Boolean(program?.requires_approval ?? true),
        terms: (program?.terms as string | null) ?? null,
      },
    };
  });

/** Public: records a referral link visit. Never reveals who referred. */
export const trackReferralVisit = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string }) => {
    if (!/^[A-Z0-9]{6,16}$/.test(input.code ?? "")) throw new Error("Invalid referral code");
    return input;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: owner } = await supabaseAdmin
      .from("referral_codes")
      .select("user_id, company_id")
      .eq("code", data.code)
      .maybeSingle();
    if (!owner) return { ok: false };
    await supabaseAdmin.from("referrals").insert({
      code: data.code,
      referrer_user_id: owner.user_id,
      referrer_company_id: owner.company_id,
      status: "Opened",
    });
    return { ok: true };
  });
