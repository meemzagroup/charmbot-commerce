import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function clientIp(): string {
  const fwd = getRequestHeader("x-forwarded-for") ?? "";
  return fwd.split(",")[0]?.trim() || getRequestHeader("cf-connecting-ip") || "unknown";
}

/** Returns true when the caller is still under the limit, and records the attempt. */
export async function rateLimit(
  kind: string,
  identifier: string,
  max: number,
  windowMinutes: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const ip = clientIp();

  const { count } = await supabaseAdmin
    .from("recovery_attempts")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .in("identifier", [identifier.toLowerCase(), ip])
    .gte("created_at", since);

  await supabaseAdmin.from("recovery_attempts").insert([
    { kind, identifier: identifier.toLowerCase(), ip_address: ip },
    { kind, identifier: ip, ip_address: ip },
  ]);

  return (count ?? 0) < max;
}

export async function writeAuditLog(entry: {
  action: string;
  companyId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  targetUserId?: string | null;
  targetEmail?: string | null;
  details?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("security_audit_logs").insert({
    action: entry.action,
    company_id: entry.companyId ?? null,
    actor_id: entry.actorId ?? null,
    actor_email: entry.actorEmail ?? null,
    target_user_id: entry.targetUserId ?? null,
    target_email: entry.targetEmail ?? null,
    details: (entry.details ?? {}) as never,
    ip_address: clientIp(),
  });
}
