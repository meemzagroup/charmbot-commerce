import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyModule } from "@/lib/plan.functions";
import { requirePublicHttpsUrl } from "@/lib/public-service-url";

/**
 * Read-only import of past WhatsApp conversations from Evolution into the CRM.
 *
 * Safety contract (regression critical):
 * - never deletes or rewrites an existing message, thread or customer
 * - only INSERTs messages whose provider id is not already stored
 * - restores each touched thread's previous unread_count and keeps
 *   last_message_at at the newest message, so backfilled history can never
 *   reorder or "unread" a live conversation
 * - never touches the Evolution instance/QR session (read endpoints only)
 */

type HistoryResult = {
  importedMessages: number;
  importedThreads: number;
  skipped: number;
  message: string;
};

function digits(v: string) {
  return (v ?? "").replace(/\D/g, "");
}

function extractText(message: Record<string, any> | undefined | null): string {
  if (!message) return "";
  return (
    message["conversation"] ??
    message["extendedTextMessage"]?.text ??
    message["imageMessage"]?.caption ??
    message["videoMessage"]?.caption ??
    message["documentMessage"]?.caption ??
    message["buttonsResponseMessage"]?.selectedDisplayText ??
    message["listResponseMessage"]?.title ??
    ""
  );
}

function toIso(ts: unknown): string | null {
  const n = typeof ts === "number" ? ts : Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() > Date.now() + 60_000) return null;
  return d.toISOString();
}

export const syncWhatsappHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { channelId: string; limit?: number }) => {
    const channelId = String(input?.channelId ?? "").trim();
    if (!channelId) throw new Error("Select a WhatsApp channel to sync");
    const limit = Math.min(Math.max(Number(input?.limit ?? 500) || 500, 50), 2000);
    return { channelId, limit };
  })
  .handler(async ({ data, context }): Promise<HistoryResult> => {
    await assertCompanyModule(context.supabase, context.userId, "whatsapp");
    const { supabase } = context as { supabase: any };

    // Tenant gate: RLS decides whether this channel belongs to the caller.
    const { data: channel } = await supabase
      .from("whatsapp_channels")
      .select("id, label, company_id, phone_number, instance_key, team_member_id")
      .eq("id", data.channelId)
      .eq("is_active", true)
      .maybeSingle();
    if (!channel?.instance_key || !channel.company_id) {
      throw new Error("The selected WhatsApp channel is not active or accessible");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["evolution_api_url", "evolution_api_key"]);
    const map = Object.fromEntries((settings ?? []).map((r) => [r.key, (r.value ?? "").trim()]));
    const rawUrl = String(map["evolution_api_url"] ?? "").replace(/\/+$/, "");
    const apiKey = String(map["evolution_api_key"] ?? "");
    if (!rawUrl || !apiKey) throw new Error("WhatsApp is not configured by the platform owner");
    const baseUrl = requirePublicHttpsUrl(rawUrl, "WhatsApp");

    const instance = encodeURIComponent(channel.instance_key);
    const headers = { apikey: apiKey, "Content-Type": "application/json" };

    const res = await fetch(`${baseUrl}/chat/findMessages/${instance}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ where: {}, limit: data.limit, page: 1, offset: 0 }),
      signal: AbortSignal.timeout(45_000),
    });
    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(
        `WhatsApp history could not be read from the server (${res.status}). ${raw.slice(0, 160)}`,
      );
    }
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    const records: any[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.messages?.records)
        ? json.messages.records
        : Array.isArray(json?.messages)
          ? json.messages
          : Array.isArray(json?.records)
            ? json.records
            : [];
    if (records.length === 0) {
      return {
        importedMessages: 0,
        importedThreads: 0,
        skipped: 0,
        message: "No past conversations were returned for this number.",
      };
    }

    type Item = {
      handle: string;
      name: string;
      fromMe: boolean;
      providerId: string | null;
      content: string;
      createdAt: string;
      messageType: string | null;
    };

    const items: Item[] = [];
    for (const rec of records.slice(0, data.limit)) {
      const key = rec?.key ?? {};
      const jid = String(key?.remoteJid ?? rec?.remoteJid ?? "");
      if (!jid || jid.includes("@g.us") || jid.includes("status@")) continue; // skip groups/status
      const handle = digits(jid.split("@")[0] ?? "");
      if (!handle) continue;
      const createdAt = toIso(rec?.messageTimestamp ?? rec?.timestamp);
      if (!createdAt) continue;
      const content =
        String(extractText(rec?.message) ?? "").trim() ||
        `[${String(rec?.messageType ?? "media")}]`;
      items.push({
        handle,
        name: String(rec?.pushName ?? "").trim() || handle,
        fromMe: key?.fromMe === true,
        providerId: key?.id ? String(key.id) : null,
        content: content.slice(0, 10_000),
        createdAt,
        messageType: rec?.messageType ? String(rec.messageType) : null,
      });
    }

    const byHandle = new Map<string, Item[]>();
    for (const it of items) {
      const list = byHandle.get(it.handle) ?? [];
      list.push(it);
      byHandle.set(it.handle, list);
    }

    let importedMessages = 0;
    let importedThreads = 0;
    let skipped = 0;

    for (const [handle, list] of byHandle) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      // Reuse the existing thread for this contact on this exact channel.
      const existingThread = await supabaseAdmin
        .from("communication_threads")
        .select("id, unread_count, last_message_at, contact_id")
        .eq("company_id", channel.company_id)
        .eq("channel_type", "whatsapp")
        .eq("contact_handle", handle)
        .eq("whatsapp_channel_id", channel.id)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let threadId = existingThread.data?.id ?? null;
      const previousUnread = existingThread.data?.unread_count ?? 0;
      const previousLast = existingThread.data?.last_message_at ?? null;

      if (!threadId) {
        const created = await supabaseAdmin
          .from("communication_threads")
          .insert({
            channel_type: "whatsapp",
            contact_name: list[list.length - 1]?.name ?? handle,
            contact_handle: handle,
            channel_number: channel.phone_number,
            whatsapp_channel_id: channel.id,
            assigned_to: channel.team_member_id ?? null,
            company_id: channel.company_id,
            subject: `WhatsApp · ${channel.label}`,
            status: "Open",
          })
          .select("id")
          .single();
        if (created.error || !created.data) {
          skipped += list.length;
          continue;
        }
        threadId = created.data.id;
        importedThreads += 1;
      }

      // Dedupe against every provider id already stored on this thread.
      const { data: existingMessages } = await supabaseAdmin
        .from("messages")
        .select("metadata, content, created_at")
        .eq("thread_id", threadId);
      const knownIds = new Set<string>();
      const knownFallback = new Set<string>();
      for (const m of existingMessages ?? []) {
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        const id = meta["message_id"] ?? meta["external_id"];
        if (typeof id === "string" && id) knownIds.add(id);
        knownFallback.add(`${m.content}|${String(m.created_at).slice(0, 16)}`);
      }

      const rows = list.filter((it) => {
        if (it.providerId && knownIds.has(it.providerId)) return false;
        if (!it.providerId && knownFallback.has(`${it.content}|${it.createdAt.slice(0, 16)}`)) return false;
        return true;
      });
      skipped += list.length - rows.length;
      if (rows.length === 0) continue;

      const insert = await supabaseAdmin.from("messages").insert(
        rows.map((it) => ({
          thread_id: threadId,
          company_id: channel.company_id,
          sender_type: it.fromMe ? "agent" : "customer",
          sender_name: it.fromMe ? channel.label : it.name,
          content: it.content,
          created_at: it.createdAt,
          delivery_status: "delivered",
          metadata: {
            instance: channel.instance_key,
            message_id: it.providerId,
            message_type: it.messageType,
            whatsapp_channel_id: channel.id,
            imported_history: true,
          } as never,
        })),
      );
      if (insert.error) {
        skipped += rows.length;
        continue;
      }
      importedMessages += rows.length;

      // The message trigger moves last_message_at/unread_count. Restore both so
      // imported history never reorders or "unreads" a live conversation.
      const newest = rows[rows.length - 1]?.createdAt ?? null;
      const restoredLast =
        previousLast && newest ? (previousLast > newest ? previousLast : newest) : (previousLast ?? newest);
      await supabaseAdmin
        .from("communication_threads")
        .update({
          unread_count: previousUnread,
          ...(restoredLast ? { last_message_at: restoredLast } : {}),
        })
        .eq("id", threadId)
        .eq("company_id", channel.company_id);
    }

    return {
      importedMessages,
      importedThreads,
      skipped,
      message: importedMessages
        ? `Imported ${importedMessages} past message${importedMessages === 1 ? "" : "s"} into ${importedThreads || "existing"} conversation${importedThreads === 1 ? "" : "s"}.`
        : "Everything on this number was already in your inbox — nothing changed.",
    };
  });
