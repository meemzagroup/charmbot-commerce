import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Bulk WhatsApp dispatch engine.
 *
 * The client calls `dispatchCampaignBatch` repeatedly while a campaign is
 * running. Each call sends a small batch, pausing a randomized 8-20 seconds
 * between individual messages so the WhatsApp number is not flagged.
 */

type EvolutionConfig = { baseUrl: string; apiKey: string };

const MIN_DELAY_MS = 8_000;
const MAX_DELAY_MS = 20_000;
const MAX_RETRIES = 3;

function jitter() {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Campaign sending is restricted to privileged staff of the tenant.
async function requireCampaignAccess(context: {
  supabase: { from: (t: string) => any; rpc: (fn: string, args: unknown) => any };
  userId: string;
}) {
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("is_super_admin, company_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!profile) throw new Error("Forbidden");
  if (!profile.is_super_admin) {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const allowed = (roles ?? []).some((r: { role: string }) =>
      ["admin", "store_manager"].includes(r.role),
    );
    if (!allowed) throw new Error("Forbidden: campaign access requires an admin role");
  }
  return profile as { is_super_admin: boolean; company_id: string | null };
}

async function readConfig(): Promise<EvolutionConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", ["evolution_api_url", "evolution_api_key"]);
  const rows = (data ?? []) as { key: string; value: string | null }[];
  const map = Object.fromEntries(rows.map((r) => [r.key, (r.value ?? "").trim()]));
  const baseUrl = (map["evolution_api_url"] ?? "").replace(/\/+$/, "");
  const apiKey = map["evolution_api_key"] ?? "";
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

export type DispatchResult = {
  processed: number;
  sent: number;
  failed: number;
  remaining: number;
  status: string;
  message: string | null;
};

export const dispatchCampaignBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string; batchSize?: number }) => {
    const campaignId = String(input?.campaignId ?? "").trim();
    if (!campaignId) throw new Error("campaignId is required");
    const batchSize = Math.min(Math.max(Number(input?.batchSize ?? 3), 1), 5);
    return { campaignId, batchSize };
  })
  .handler(async ({ data, context }): Promise<DispatchResult> => {
    await requireCampaignAccess(context as never);
    const db = (context as { supabase: any }).supabase;

    const { data: campaign, error } = await db
      .from("whatsapp_campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (error || !campaign) throw new Error("Campaign not found");

    const idle = (status: string, message: string | null = null): DispatchResult => ({
      processed: 0,
      sent: 0,
      failed: 0,
      remaining: 0,
      status,
      message,
    });

    if (campaign.status === "paused") return idle("paused", "Campaign is paused.");
    if (campaign.status === "completed") return idle("completed");

    if (campaign.status === "scheduled") {
      const due = campaign.scheduled_at ? new Date(campaign.scheduled_at) <= new Date() : true;
      if (!due) return idle("scheduled", "Campaign is scheduled for a later time.");
      await db.from("whatsapp_campaigns").update({ status: "in_progress" }).eq("id", campaign.id);
    }

    const cfg = await readConfig();
    if (!cfg) {
      await db.from("whatsapp_campaigns").update({ status: "failed" }).eq("id", campaign.id);
      return idle("failed", "Evolution API server URL and API key are not configured in Settings.");
    }

    const instance = String(campaign.instance_name ?? "").trim();
    if (!instance) {
      await db.from("whatsapp_campaigns").update({ status: "failed" }).eq("id", campaign.id);
      return idle("failed", "No WhatsApp instance is selected for this campaign.");
    }

    const { data: pending } = await db
      .from("whatsapp_campaign_logs")
      .select("id, phone_number, rendered_message, retry_count, customer_id")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(data.batchSize);

    const queue = (pending ?? []) as {
      id: string;
      phone_number: string;
      rendered_message: string;
      retry_count: number;
      customer_id: string | null;
    }[];

    let sent = 0;
    let failed = 0;

    for (const [i, item] of queue.entries()) {
      // Anti-ban throttle: randomized human-like gap between messages.
      if (i > 0) await sleep(jitter());

      // Never message a contact who opted out after the queue was built.
      if (item.customer_id) {
        const { data: customer } = await db
          .from("customers")
          .select("whatsapp_opted_out")
          .eq("id", item.customer_id)
          .maybeSingle();
        if (customer?.whatsapp_opted_out) {
          await db
            .from("whatsapp_campaign_logs")
            .update({
              status: "opted_out",
              error_reason: "Recipient opted out of WhatsApp messages",
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);
          continue;
        }
      }

      const number = item.phone_number.replace(/\D/g, "");
      try {
        const res = await fetch(
          `${cfg.baseUrl}/message/sendText/${encodeURIComponent(instance)}`,
          {
            method: "POST",
            headers: { apikey: cfg.apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ number, text: item.rendered_message }),
            signal: AbortSignal.timeout(20_000),
          },
        );
        const raw = await res.text().catch(() => "");
        let json: { key?: { id?: string } } | null = null;
        try {
          json = raw ? JSON.parse(raw) : null;
        } catch {
          json = null;
        }
        if (res.ok) {
          sent++;
          await db
            .from("whatsapp_campaign_logs")
            .update({
              status: "sent",
              error_reason: null,
              external_id: json?.key?.id ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);
        } else {
          failed++;
          await db
            .from("whatsapp_campaign_logs")
            .update({
              status: "failed",
              error_reason: `HTTP ${res.status}: ${raw.replace(/\s+/g, " ").slice(0, 300)}`,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);
        }
      } catch (e) {
        failed++;
        await db
          .from("whatsapp_campaign_logs")
          .update({
            status: "failed",
            error_reason: e instanceof Error ? `${e.name}: ${e.message}` : "Unknown network error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);
      }
    }

    // Recompute counters from the log table so the monitor is always truthful.
    const { data: allLogs } = await db
      .from("whatsapp_campaign_logs")
      .select("status")
      .eq("campaign_id", campaign.id);
    const rows = (allLogs ?? []) as { status: string }[];
    const remaining = rows.filter((r) => r.status === "pending").length;
    const sentTotal = rows.filter((r) => ["sent", "delivered", "read"].includes(r.status)).length;
    const failedTotal = rows.filter((r) => r.status === "failed").length;
    const status = remaining === 0 ? "completed" : "in_progress";

    await db
      .from("whatsapp_campaigns")
      .update({
        sent_count: sentTotal,
        failed_count: failedTotal,
        total_contacts: rows.length,
        status,
      })
      .eq("id", campaign.id);

    return {
      processed: queue.length,
      sent,
      failed,
      remaining,
      status,
      message: null,
    };
  });

export const retryFailedMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campaignId: string }) => {
    const campaignId = String(input?.campaignId ?? "").trim();
    if (!campaignId) throw new Error("campaignId is required");
    return { campaignId };
  })
  .handler(async ({ data, context }) => {
    await requireCampaignAccess(context as never);
    const db = (context as { supabase: any }).supabase;

    const { data: failedLogs } = await db
      .from("whatsapp_campaign_logs")
      .select("id, retry_count")
      .eq("campaign_id", data.campaignId)
      .eq("status", "failed");

    const rows = (failedLogs ?? []) as { id: string; retry_count: number }[];
    const retryable = rows.filter((r) => (r.retry_count ?? 0) < MAX_RETRIES);

    for (const row of retryable) {
      await db
        .from("whatsapp_campaign_logs")
        .update({
          status: "pending",
          error_reason: null,
          retry_count: (row.retry_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }

    if (retryable.length) {
      await db
        .from("whatsapp_campaigns")
        .update({ status: "in_progress" })
        .eq("id", data.campaignId);
    }

    return {
      requeued: retryable.length,
      exhausted: rows.length - retryable.length,
      maxRetries: MAX_RETRIES,
    };
  });
