import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Generic response used for every unauthenticated recovery call so the
 *  endpoint never reveals whether an account exists. */
export type RecoveryResult = {
  ok: boolean;
  message: string;
  maskedEmail?: string | null;
};

export function maskEmail(email: string): string {
  const [name = "", domain = ""] = email.split("@");
  const head = name.slice(0, 1);
  const tail = name.length > 3 ? name.slice(-1) : "";
  return `${head}${"*".repeat(Math.max(3, name.length - 2))}${tail}@${domain}`;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function serverHelpers() {
  return await import("@/lib/recovery.server");
}

function safeRedirect(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("bad");
    return `${url.origin}/reset-password`;
  } catch {
    throw new Error("Invalid application address");
  }
}

/** Step 1 of password recovery: sends a single-use, expiring reset link. */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; origin: string }) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? "")) {
      throw new Error("Enter a valid email address");
    }
    return input;
  })
  .handler(async ({ data }): Promise<RecoveryResult> => {
    const email = data.email.trim().toLowerCase();
    const generic = {
      ok: true,
      message:
        "If that email is registered, a password reset link is on its way. The link can only be used once and expires shortly.",
    };

    const { rateLimit, writeAuditLog } = await serverHelpers();
    if (!(await rateLimit("password_reset", email, 5, 60))) {
      return {
        ok: false,
        message: "Too many recovery attempts. Please wait an hour before trying again.",
      };
    }

    const db = await admin();
    const { data: profile } = await db
      .from("profiles")
      .select("id, company_id, status")
      .eq("email", email)
      .maybeSingle();

    await writeAuditLog({
      action: "password_reset_requested",
      companyId: profile?.company_id ?? null,
      targetUserId: profile?.id ?? null,
      targetEmail: email,
      details: { accountFound: Boolean(profile) },
    });

    if (!profile) return generic;
    if (profile.status === "Inactive") {
      return {
        ok: false,
        message:
          "This account is deactivated. Please contact your company administrator to restore access.",
      };
    }

    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    await client.auth.resetPasswordForEmail(email, { redirectTo: safeRedirect(data.origin) });
    return generic;
  });

/** Recover a forgotten login ID using administrator-approved identifiers. */
export const recoverLoginId = createServerFn({ method: "POST" })
  .inputValidator((input: { companyCode?: string; employeeId?: string; mobile?: string }) => {
    const provided = [input.companyCode, input.employeeId, input.mobile].filter(
      (v) => (v ?? "").trim().length > 0,
    );
    if (provided.length < 2) {
      throw new Error("Provide at least two details so we can verify your identity");
    }
    return input;
  })
  .handler(async ({ data }): Promise<RecoveryResult> => {
    const employeeId = data.employeeId?.trim() ?? "";
    const mobile = (data.mobile ?? "").replace(/[^\d+]/g, "");
    const companyCode = data.companyCode?.trim() ?? "";
    const fingerprint = `${companyCode}|${employeeId}|${mobile}`.toLowerCase();

    const { rateLimit, writeAuditLog } = await serverHelpers();
    if (!(await rateLimit("login_id", fingerprint, 5, 60))) {
      return {
        ok: false,
        message: "Too many recovery attempts. Please wait an hour before trying again.",
      };
    }

    const db = await admin();
    let companyId: string | null = null;
    if (companyCode) {
      const { data: company } = await db
        .from("companies")
        .select("id")
        .ilike("company_code", companyCode)
        .maybeSingle();
      companyId = company?.id ?? null;
      if (!companyId) {
        return {
          ok: false,
          message:
            "We could not verify those details. Please check them or contact your company administrator.",
        };
      }
    }

    let query = db.from("profiles").select("id, email, company_id, employee_id, mobile_number");
    if (companyId) query = query.eq("company_id", companyId);
    if (employeeId) query = query.ilike("employee_id", employeeId);
    if (mobile) query = query.ilike("mobile_number", `%${mobile.slice(-9)}`);

    const { data: matches } = await query.limit(2);
    const match = matches?.length === 1 ? matches[0] : null;

    await writeAuditLog({
      action: "login_id_recovery_attempt",
      companyId: match?.company_id ?? companyId,
      targetUserId: match?.id ?? null,
      targetEmail: match?.email ?? null,
      details: { matched: Boolean(match), usedCompanyCode: Boolean(companyCode) },
    });

    if (!match?.email) {
      return {
        ok: false,
        message:
          "We could not verify those details. Please check them or contact your company administrator.",
      };
    }

    return {
      ok: true,
      message: "Identity verified. This is your registered login ID:",
      maskedEmail: maskEmail(match.email),
    };
  });

/** Called right after a user sets a new password from a recovery link. */
export const completePasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { writeAuditLog } = await serverHelpers();
    const db = await admin();
    const { data: profile } = await db
      .from("profiles")
      .select("email, company_id")
      .eq("id", context.userId)
      .maybeSingle();

    await db
      .from("profiles")
      .update({ must_reset_password: false })
      .eq("id", context.userId);

    await writeAuditLog({
      action: "password_reset_completed",
      companyId: profile?.company_id ?? null,
      actorId: context.userId,
      actorEmail: profile?.email ?? null,
      targetUserId: context.userId,
      targetEmail: profile?.email ?? null,
    });

    return { ok: true };
  });

/** Tells the app whether the signed-in user is forced to change their password. */
export const getMyPasswordState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("must_reset_password, status")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      mustReset: Boolean(data?.must_reset_password),
      status: (data?.status ?? "Active") as string,
    };
  });
