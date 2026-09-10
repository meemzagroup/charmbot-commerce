import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-webhook-secret",
};

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Evolution v1/v2 and common forks move instance/data fields between releases.
// Bound the top-level keys while normalizing variants below.
const PayloadSchema = z.record(z.string().max(100), z.unknown());

type EvolutionData = {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string };
  pushName?: string;
  message?: Record<string, unknown>;
  messageType?: string;
  status?: string | number;
  keyId?: string;
};

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizePayload(raw: Record<string, unknown>) {
  const nested = raw["body"] && typeof raw["body"] === "object"
    ? raw["body"] as Record<string, unknown>
    : raw;
  const rawData = nested["data"];
  const first = Array.isArray(rawData) ? rawData[0] : rawData;
  const data = first && typeof first === "object" ? first as EvolutionData : {};
  const rawInstance = nested["instance"];
  const instance = typeof rawInstance === "object" && rawInstance
    ? text((rawInstance as Record<string, unknown>)["instanceName"] ?? (rawInstance as Record<string, unknown>)["name"])
    : text(rawInstance ?? nested["instanceName"]);
  return {
    event: text(nested["event"] ?? nested["type"], 80) || "messages.upsert",
    instance,
    sender: text(nested["sender"] ?? nested["server_url"], 120),
    data,
  };
}

function extractText(message: Record<string, unknown> | undefined): string {
  if (!message) return "";
  const m = message as Record<string, any>;
  return (
    m['conversation'] ??
    m['extendedTextMessage']?.text ??
    m['imageMessage']?.caption ??
    m['videoMessage']?.caption ??
    m['documentMessage']?.caption ??
    m['buttonsResponseMessage']?.selectedDisplayText ??
    m['listResponseMessage']?.title ??
    ""
  );
}

import { waContactKey, waDigits, waStoredHandle, isStatusJid, isGroupJid } from "@/lib/wa-identity";

function digits(v: string) {
  return waDigits(v);
}

export const Route = createFileRoute("/api/public/comms/evolution")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const secret = process.env["COMMS_WEBHOOK_SECRET"];
        const url = new URL(request.url);
        const provided =
          request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
        if (!secret || !safeEqual(provided, secret)) {
          return Response.json({ error: "Invalid webhook secret" }, { status: 401, headers: CORS });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400, headers: CORS });
        }

        const parsed = PayloadSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid payload", issues: parsed.error.issues.slice(0, 10) },
            { status: 422, headers: CORS },
          );
        }
        const p = normalizePayload(parsed.data);
        const event = (p.event ?? "messages.upsert").toLowerCase();
        if (!event.includes("messages")) {
          return Response.json({ ok: true, ignored: event }, { headers: CORS });
        }

        const remoteJid = p.data?.key?.remoteJid ?? "";
        if (isStatusJid(remoteJid)) {
          return Response.json({ ok: true, ignored: "status broadcast" }, { headers: CORS });
        }
        const handle = waStoredHandle(remoteJid);
        const contactKey = waContactKey(remoteJid);
        const content = extractText(p.data?.message).trim() || `[${p.data?.messageType ?? "media"}]`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Resolve the receiving channel before processing any event. Unknown
        // instances are rejected so privileged webhook writes can never create
        // tenantless rows or update a different company's delivery records.
        const instanceName = (p.instance ?? "").trim();
        const senderNumber = digits(p.sender ?? "");
        const channels = await supabaseAdmin
          .from("whatsapp_channels")
          .select("id, label, instance_key, phone_number, team_member_id, company_id")
          .eq("is_active", true);
        const channel =
          (channels.data ?? []).find(
            (c) => (c.instance_key ?? "").trim().toLowerCase() === instanceName.toLowerCase(),
          ) ?? ((channels.data ?? []).filter(
            (c) => c.label.trim().toLowerCase() === instanceName.toLowerCase(),
          ).length === 1
            ? (channels.data ?? []).find((c) => c.label.trim().toLowerCase() === instanceName.toLowerCase())
            : undefined) ??
          (senderNumber && (channels.data ?? []).filter(
            (c) => digits(c.phone_number).endsWith(senderNumber.slice(-9)),
          ).length === 1
            ? (channels.data ?? []).find((c) => digits(c.phone_number).endsWith(senderNumber.slice(-9)))
            : undefined) ??
          null;
        if (!channel?.company_id) {
          return Response.json({ error: "Unknown WhatsApp channel" }, { status: 422, headers: CORS });
        }
        const channelNumber = channel.phone_number;

        // ---- Campaign delivery status sync (messages.update) ----
        const ackStatus = String(p.data?.status ?? "").toUpperCase();
        const messageId = p.data?.key?.id ?? p.data?.keyId ?? null;
        if (event.includes("update")) {
          if (!messageId) return Response.json({ ok: true, ignored: "no message id" }, { headers: CORS });
          const mapped =
            ackStatus.includes("READ") || ackStatus.includes("PLAYED")
              ? "read"
              : ackStatus.includes("DELIVERY") || ackStatus.includes("DELIVERED")
                ? "delivered"
                : ackStatus.includes("ERROR")
                  ? "failed"
                  : null;
          if (!mapped) return Response.json({ ok: true, ignored: ackStatus }, { headers: CORS });
          await supabaseAdmin
            .from("whatsapp_campaign_logs")
            .update({
              status: mapped,
              ...(mapped === "failed" ? { error_reason: `Delivery failed (${ackStatus})` } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("external_id", messageId)
            .eq("company_id", channel.company_id);
          return Response.json({ ok: true, status: mapped }, { headers: CORS });
        }

        if (!handle) {
          return Response.json({ error: "Missing sender" }, { status: 422, headers: CORS });
        }

        // Resolve which saved channel this instance belongs to. Matching is done
        // on the technical instance key first, then the legacy display name,
        // then the receiving number. This must happen BEFORE any customer
        // lookup so every write stays scoped to the receiving company.
        // ---- Opt-out keyword processing (scoped to the receiving company) ----
        const fromCustomer = p.data?.key?.fromMe !== true;

        // Evolution retries webhooks. Return success for an already persisted
        // provider message instead of creating duplicate bubbles/threads.
        if (messageId) {
          const duplicate = await supabaseAdmin
            .from("messages")
            .select("id, thread_id")
            .eq("company_id", channel.company_id)
            .eq("metadata->>message_id", messageId)
            .limit(1)
            .maybeSingle();
          if (duplicate.data) {
            return Response.json({ ok: true, duplicate: true, thread_id: duplicate.data.thread_id }, { headers: CORS });
          }
        }

        const keyword = content.replace(/[^a-z]/gi, "").toUpperCase();
        if (fromCustomer && ["STOP", "UNSUBSCRIBE", "OPTOUT"].includes(keyword)) {
          const tail = digits(handle).slice(-9);
          const { data: matches } = await supabaseAdmin
            .from("customers")
            .select("id, phone")
            .eq("company_id", channel.company_id);
          const optOutIds = (matches ?? [])
            .filter((c) => tail && digits(c.phone ?? "").endsWith(tail))
            .map((c) => c.id);
          if (optOutIds.length) {
            await supabaseAdmin
              .from("customers")
              .update({ whatsapp_opted_out: true, whatsapp_opt_out_date: new Date().toISOString() })
              .eq("company_id", channel.company_id)
              .in("id", optOutIds);
            await supabaseAdmin
              .from("whatsapp_campaign_logs")
              .update({
                status: "opted_out",
                error_reason: "Recipient replied with an opt-out keyword",
                updated_at: new Date().toISOString(),
              })
              .eq("company_id", channel.company_id)
              .in("customer_id", optOutIds)
              .eq("status", "pending");
          }
        }


        // ONE contact = ONE thread per connected number. The canonical identity
        // is company + whatsapp channel + normalized contact key, so number
        // formatting differences never split a conversation, and a resolved
        // conversation reopens instead of spawning a second row.
        const existing = await supabaseAdmin
          .from("communication_threads")
          .select("id, status")
          .eq("company_id", channel.company_id)
          .eq("channel_type", "whatsapp")
          .eq("contact_key", contactKey)
          .eq("whatsapp_channel_id", channel.id)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing.error) {
          return Response.json({ error: "Lookup failed" }, { status: 500, headers: CORS });
        }


        let threadId = existing.data?.id ?? null;
        let customerId: string | null = null;
        const isGroup = isGroupJid(remoteJid);
        if (fromCustomer && !isGroup) {
          const { data: companyCustomers } = await supabaseAdmin
            .from("customers")
            .select("id, phone")
            .eq("company_id", channel.company_id);
          const tail = digits(handle).slice(-9);
          customerId = (companyCustomers ?? []).find(
            (customer) => tail && digits(customer.phone ?? "").endsWith(tail),
          )?.id ?? null;
          if (!customerId) {
            const createdCustomer = await supabaseAdmin
              .from("customers")
              .insert({
                company_id: channel.company_id,
                full_name: p.data?.pushName ?? handle,
                phone: handle,
                customer_tag: "New",
                assigned_to: channel.team_member_id ?? null,
                notes: `Created from inbound WhatsApp on ${channel.label}`,
              })
              .select("id")
              .single();
            if (createdCustomer.error) {
              console.error("Evolution webhook customer create failed", createdCustomer.error.message);
            } else {
              customerId = createdCustomer.data.id;
            }
          }
        }
        if (!threadId) {
          const created = await supabaseAdmin
            .from("communication_threads")
            .insert({
              channel_type: "whatsapp",
              contact_name: p.data?.pushName ?? handle,
              contact_handle: handle,
               external_id: p.data?.key?.id ?? null,
               channel_number: channelNumber,
               whatsapp_channel_id: channel.id,
               contact_id: customerId,
               assigned_to: channel.team_member_id ?? null,
               company_id: channel.company_id,
               subject: `WhatsApp · ${channel.label}`,
              status: "Open",
            })
            .select("id")
            .single();
          if (created.error || !created.data) {
            // Concurrent webhook delivery already created the canonical thread.
            const retry = await supabaseAdmin
              .from("communication_threads")
              .select("id")
              .eq("company_id", channel.company_id)
              .eq("channel_type", "whatsapp")
              .eq("contact_key", contactKey)
              .eq("whatsapp_channel_id", channel.id)
              .limit(1)
              .maybeSingle();
            if (!retry.data?.id) {
              return Response.json({ error: "Could not create thread" }, { status: 500, headers: CORS });
            }
            threadId = retry.data.id;
          } else {
            threadId = created.data.id;
          }
        } else {
          await supabaseAdmin
            .from("communication_threads")
            .update({
              channel_number: channelNumber,
              whatsapp_channel_id: channel.id,
              // A new message reopens a resolved conversation instead of
              // starting a second one, exactly like WhatsApp.
              ...(existing.data?.status === "Resolved" ? { status: "Open" } : {}),
              ...(customerId ? { contact_id: customerId } : {}),
            })
            .eq("id", threadId)
            .eq("company_id", channel.company_id);
        }

        const fromMe = p.data?.key?.fromMe === true;
        const inserted = await supabaseAdmin.from("messages").insert({
          thread_id: threadId,
          sender_type: fromMe ? "agent" : "customer",
           sender_name: fromMe ? channel.label : (p.data?.pushName ?? handle),
          content,
          delivery_status: "delivered",
          metadata: {
            instance: instanceName,
            message_id: p.data?.key?.id ?? null,
            message_type: p.data?.messageType ?? null,
             whatsapp_channel_id: channel.id,
          } as never,
        });
        if (inserted.error) {
          return Response.json({ error: "Could not store message" }, { status: 500, headers: CORS });
        }

        return Response.json(
           { ok: true, thread_id: threadId, channel: channel.label },
          { headers: CORS },
        );
      },
    },
  },
});
