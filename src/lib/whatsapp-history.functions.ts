import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyModule } from "@/lib/plan.functions";
import { requirePublicHttpsUrl } from "@/lib/public-service-url";
import {
  waContactKey,
  waStoredHandle,
  isGroupJid,
  isStatusJid,
  waResolveJid,
  waParticipantJid,
  waGroupFallbackName,
} from "@/lib/wa-identity";
import { fetchGroupSubject } from "@/lib/wa-group";
import { resolveOrCreateWhatsAppConversation } from "@/lib/wa-thread";
import { parseWaMessage, waMessageMetadata } from "@/lib/wa-message";

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

/** Marks a thread whose display name is the real WhatsApp group subject. */
const GROUP_SUBJECT_MARK = "WhatsApp Group";

type HistoryResult = {
  importedMessages: number;
  importedThreads: number;
  skipped: number;
  message: string;
};

function digits(v: string) {
  return (v ?? "").replace(/\D/g, "");
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
    const limit = Math.min(Math.max(Number(input?.limit ?? 2000) || 2000, 50), 5000);
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

    // Evolution returns history page by page. Walk pages until the requested
    // depth is reached or the server stops returning rows, so we import every
    // message the connected session still exposes — not just chat headers.
    const pageSize = 200;
    const records: any[] = [];
    for (let page = 1; page <= Math.ceil(data.limit / pageSize); page++) {
      const res = await fetch(`${baseUrl}/chat/findMessages/${instance}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          where: {},
          limit: pageSize,
          page,
          offset: (page - 1) * pageSize,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const raw = await res.text().catch(() => "");
      if (!res.ok) {
        if (page > 1) break;
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
      const batch: any[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.messages?.records)
          ? json.messages.records
          : Array.isArray(json?.messages)
            ? json.messages
            : Array.isArray(json?.records)
              ? json.records
              : [];
      records.push(...batch);
      if (batch.length < pageSize) break;
    }
    if (records.length === 0) {
      return {
        importedMessages: 0,
        importedThreads: 0,
        skipped: 0,
        message: "No past conversations were returned for this number.",
      };
    }

    type Item = {
      isGroup: boolean;
      handle: string;
      contactKey: string;
      name: string;
      fromMe: boolean;
      providerId: string | null;
      content: string;
      createdAt: string;
      messageType: string | null;
      status: string | null;
      metadata: Record<string, unknown>;
    };

    const items: Item[] = [];
    for (const rec of records.slice(0, data.limit)) {
      const key = rec?.key ?? {};
      const jid = waResolveJid(key) || String(rec?.remoteJid ?? "");
      if (!jid || isStatusJid(jid)) continue; // skip status updates
      const group = isGroupJid(jid);
      const handle = waStoredHandle(jid);
      const contactKey = waContactKey(jid);
      if (!handle || !contactKey) continue;
      const createdAt = toIso(rec?.messageTimestamp ?? rec?.timestamp);
      if (!createdAt) continue;
      const parsed = parseWaMessage(rec?.message, rec?.messageType ?? null);
      const content = parsed.content;
      const participant = group ? waParticipantJid(key) : "";
      items.push({
        metadata: waMessageMetadata(parsed, {
          ...(group ? { is_group: true, group_jid: jid, participant: participant || null } : {}),
        }),
        isGroup: group,
        handle,
        contactKey,
        name:
          String(rec?.pushName ?? "").trim() ||
          (participant ? waStoredHandle(participant) : "") ||
          handle,
        fromMe: key?.fromMe === true,
        providerId: key?.id ? String(key.id) : null,
        content: content.slice(0, 10_000),
        createdAt,
        messageType: parsed.type || (rec?.messageType ? String(rec.messageType) : null),
        status: rec?.status ? String(rec.status).toLowerCase() : null,
      });
    }

    // Group by canonical contact identity so 03xx / +923xx / JID variants of
    // the same person all land in ONE conversation for this channel.
    const byHandle = new Map<string, Item[]>();
    for (const it of items) {
      const list = byHandle.get(it.contactKey) ?? [];
      list.push(it);
      byHandle.set(it.contactKey, list);
    }

    let importedMessages = 0;
    let importedThreads = 0;
    let skipped = 0;

    for (const [contactKey, list] of byHandle) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const handle = list[list.length - 1]?.handle ?? contactKey;

      // Reuse the ONE canonical conversation for this contact/group on this
      // company's connected number.
      const existingThread = await supabaseAdmin
        .from("communication_threads")
        .select("id, unread_count, last_message_at, contact_id, contact_name, subject")
        .eq("company_id", channel.company_id)
        .eq("channel_type", "whatsapp")
        .eq("whatsapp_channel_id", channel.id)
        .eq("contact_key", contactKey)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // A group conversation is named after the WhatsApp group subject, never
      // after whichever member sent a message.
      const isGroupChat = list.some((it) => it.isGroup);
      let groupName: string | null = null;
      if (isGroupChat && existingThread.data?.subject !== GROUP_SUBJECT_MARK) {
        groupName = await fetchGroupSubject(baseUrl, apiKey, channel.instance_key, `${contactKey}@g.us`);
        if (!groupName && !existingThread.data?.contact_name) groupName = waGroupFallbackName(contactKey);
      }
      const previousUnread = existingThread.data?.unread_count ?? 0;
      const previousLast = existingThread.data?.last_message_at ?? null;

      // Shared canonical resolver: import and live messages land in the very
      // same conversation.
      let threadId: string;
      try {
        const resolved = await resolveOrCreateWhatsAppConversation(supabaseAdmin as never, {
          companyId: channel.company_id,
          jid: isGroupChat ? `${contactKey}@g.us` : handle,
          channel: {
            id: channel.id,
            label: channel.label,
            phone_number: channel.phone_number,
            team_member_id: channel.team_member_id,
            company_id: channel.company_id,
          },
          displayName: list[list.length - 1]?.name ?? handle,
          groupName,
          subjectMark: GROUP_SUBJECT_MARK,
          reopen: false,
        });
        threadId = resolved.id;
        if (resolved.created) importedThreads += 1;
      } catch {
        skipped += list.length;
        continue;
      }

      // Dedupe against every provider id already stored on this thread.
      const { data: existingMessages } = await supabaseAdmin
        .from("messages")
        .select("id, metadata, content, created_at")
        .eq("thread_id", threadId);
      const knownById = new Map<string, { id: string; metadata: Record<string, unknown> }>();
      const knownIds = new Set<string>();
      const knownFallback = new Set<string>();
      for (const m of existingMessages ?? []) {
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        const id = meta["message_id"] ?? meta["external_id"];
        if (typeof id === "string" && id) {
          knownIds.add(id);
          knownById.set(id, { id: m.id as string, metadata: meta });
        }
        knownFallback.add(`${m.content}|${String(m.created_at).slice(0, 16)}`);
      }

      const enrich: { id: string; metadata: Record<string, unknown> }[] = [];
      const rows = list.filter((it) => {
        if (it.providerId) {
          if (knownIds.has(it.providerId)) {
            // Already imported: top up older rows that were stored before rich
            // media details existed. Never rewrites content or timestamps.
            const known = knownById.get(it.providerId);
            if (known && !known.metadata["media"] && !known.metadata["contact"] && !known.metadata["location"]) {
              const fresh = it.metadata as Record<string, unknown>;
              if (fresh["media"] || fresh["contact"] || fresh["location"] || fresh["quoted"]) {
                enrich.push({ id: known.id, metadata: { ...known.metadata, ...fresh } });
              }
            }
            return false;
          }
          knownIds.add(it.providerId); // guard against repeats inside one page too
          return true;
        }
        const fallback = `${it.content}|${it.createdAt.slice(0, 16)}`;
        if (knownFallback.has(fallback)) return false;
        knownFallback.add(fallback);
        return true;
      });
      skipped += list.length - rows.length;
      for (const row of enrich) {
        await supabaseAdmin.from("messages").update({ metadata: row.metadata as never }).eq("id", row.id);
      }
      if (rows.length === 0) continue;

      const payload = rows.map((it) => ({
        thread_id: threadId,
        company_id: channel.company_id,
        sender_type: it.fromMe ? "agent" : "customer",
        sender_name: it.fromMe ? channel.label : it.name,
        content: it.content,
        created_at: it.createdAt,
        delivery_status: it.status && it.fromMe ? it.status : "delivered",
        metadata: {
          ...it.metadata,
          instance: channel.instance_key,
          message_id: it.providerId,
          message_type: it.messageType,
          whatsapp_channel_id: channel.id,
          imported_history: true,
        } as never,
      }));

      const insert = await supabaseAdmin.from("messages").insert(payload);
      if (insert.error) {
        // Fall back to row-by-row so one rejected message cannot drop a whole
        // conversation's history.
        let ok = 0;
        for (const row of payload) {
          const single = await supabaseAdmin.from("messages").insert(row);
          if (single.error) skipped += 1;
          else ok += 1;
        }
        importedMessages += ok;
      } else {
        importedMessages += rows.length;
      }

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
