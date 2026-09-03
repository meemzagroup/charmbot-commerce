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

// Evolution API "messages.upsert" style payload (kept permissive on purpose).
const PayloadSchema = z.object({
  event: z.string().max(80).optional(),
  instance: z.string().max(200).optional(),
  sender: z.string().max(120).optional(),
  data: z
    .object({
      key: z
        .object({
          remoteJid: z.string().max(200).optional(),
          fromMe: z.boolean().optional(),
          id: z.string().max(200).optional(),
        })
        .optional(),
      pushName: z.string().max(200).optional(),
      message: z.record(z.string(), z.unknown()).optional(),
      messageType: z.string().max(80).optional(),
      status: z.union([z.string().max(80), z.number()]).optional(),
      keyId: z.string().max(200).optional(),
    })

    .optional(),
});

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

function digits(v: string) {
  return v.replace(/\D/g, "");
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
        const p = parsed.data;
        const event = (p.event ?? "messages.upsert").toLowerCase();
        if (!event.includes("messages")) {
          return Response.json({ ok: true, ignored: event }, { headers: CORS });
        }

        const remoteJid = p.data?.key?.remoteJid ?? "";
        const handle = remoteJid.split("@")[0] ?? "";
        const content = extractText(p.data?.message).trim() || `[${p.data?.messageType ?? "media"}]`;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
            .eq("external_id", messageId);
          return Response.json({ ok: true, status: mapped }, { headers: CORS });
        }

        if (!handle) {
          return Response.json({ error: "Missing sender" }, { status: 422, headers: CORS });
        }

        // ---- Opt-out keyword processing ----
        const fromCustomer = p.data?.key?.fromMe !== true;
        const keyword = content.replace(/[^a-z]/gi, "").toUpperCase();
        if (fromCustomer && ["STOP", "UNSUBSCRIBE", "OPTOUT", "OPTOUT"].includes(keyword)) {
          const tail = digits(handle).slice(-9);
          const { data: matches } = await supabaseAdmin
            .from("customers")
            .select("id, phone");
          const optOutIds = (matches ?? [])
            .filter((c) => tail && digits(c.phone ?? "").endsWith(tail))
            .map((c) => c.id);
          if (optOutIds.length) {
            await supabaseAdmin
              .from("customers")
              .update({ whatsapp_opted_out: true, whatsapp_opt_out_date: new Date().toISOString() })
              .in("id", optOutIds);
            await supabaseAdmin
              .from("whatsapp_campaign_logs")
              .update({
                status: "opted_out",
                error_reason: "Recipient replied with an opt-out keyword",
                updated_at: new Date().toISOString(),
              })
              .in("customer_id", optOutIds)
              .eq("status", "pending");
          }
        }


        // Resolve the department/employee channel this instance belongs to.
        const instanceName = (p.instance ?? "").trim();
        const senderNumber = digits(p.sender ?? "");
        const channels = await supabaseAdmin
          .from("whatsapp_channels")
          .select("id, label, phone_number, team_member_id, company_id");
        const channel =
          (channels.data ?? []).find(
            (c) => c.label.trim().toLowerCase() === instanceName.toLowerCase(),
          ) ??
          (senderNumber
            ? (channels.data ?? []).find((c) => digits(c.phone_number).endsWith(senderNumber.slice(-9)))
            : undefined) ??
          null;

        const channelNumber = channel?.phone_number ?? (p.sender || instanceName || null);

        // Scope thread reuse to this exact department number so the same
        // contact writing to two numbers never lands in one shared thread.
        let lookup = supabaseAdmin
          .from("communication_threads")
          .select("id")
          .eq("channel_type", "whatsapp")
          .eq("contact_handle", handle)
          .neq("status", "Resolved");
        lookup = channelNumber
          ? lookup.eq("channel_number", channelNumber)
          : lookup.is("channel_number", null);
        const existing = await lookup
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing.error) {
          return Response.json({ error: "Lookup failed" }, { status: 500, headers: CORS });
        }


        let threadId = existing.data?.id ?? null;
        if (!threadId) {
          const created = await supabaseAdmin
            .from("communication_threads")
            .insert({
              channel_type: "whatsapp",
              contact_name: p.data?.pushName ?? handle,
              contact_handle: handle,
               external_id: p.data?.key?.id ?? null,
               channel_number: channelNumber,
               assigned_to: channel?.team_member_id ?? null,
               company_id: channel?.company_id ?? null,
               subject: channel?.label ? `WhatsApp · ${channel.label}` : null,
              status: "Open",
            })
            .select("id")
            .single();
          if (created.error || !created.data) {
            return Response.json({ error: "Could not create thread" }, { status: 500, headers: CORS });
          }
          threadId = created.data.id;
        } else if (channelNumber) {
          await supabaseAdmin
            .from("communication_threads")
            .update({ channel_number: channelNumber })
            .eq("id", threadId)
            .is("channel_number", null);
        }

        const fromMe = p.data?.key?.fromMe === true;
        const inserted = await supabaseAdmin.from("messages").insert({
          thread_id: threadId,
          sender_type: fromMe ? "agent" : "customer",
          sender_name: fromMe ? (channel?.label ?? "Agent") : (p.data?.pushName ?? handle),
          content,
          delivery_status: "delivered",
          metadata: {
            instance: instanceName,
            message_id: p.data?.key?.id ?? null,
            message_type: p.data?.messageType ?? null,
          } as never,
        });
        if (inserted.error) {
          return Response.json({ error: "Could not store message" }, { status: 500, headers: CORS });
        }

        return Response.json(
          { ok: true, thread_id: threadId, channel: channel?.label ?? null },
          { headers: CORS },
        );
      },
    },
  },
});
