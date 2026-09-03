import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const PayloadSchema = z.object({
  channel: z.enum(["whatsapp", "email", "call", "webchat"]),
  contact: z.object({
    name: z.string().min(1).max(200).optional(),
    handle: z.string().min(1).max(200),
    external_id: z.string().max(200).optional(),
  }),
  subject: z.string().max(300).optional(),
  channel_number: z.string().max(60).optional(),
  assigned_to: z.string().uuid().optional(),
  message: z
    .object({
      content: z.string().max(10000),
      sender_type: z.enum(["customer", "agent", "system"]).default("customer"),
      sender_name: z.string().max(200).optional(),
      delivery_status: z.string().max(40).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  call: z
    .object({
      call_type: z.enum(["Incoming", "Outgoing", "Missed"]),
      duration_seconds: z.number().int().min(0).max(86400).default(0),
      status: z.string().max(40).optional(),
      notes: z.string().max(5000).optional(),
      recording_url: z.string().url().max(1000).optional(),
      transcript: z.string().max(20000).optional(),
    })
    .optional(),
});

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

export const Route = createFileRoute("/api/public/comms/inbound")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const secret = process.env["COMMS_WEBHOOK_SECRET"];
        const provided = request.headers.get("x-webhook-secret") ?? "";
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

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Find the configured channel first so this inbound record inherits its tenant.
        const { data: channel } = p.channel_number
          ? await supabaseAdmin.from("whatsapp_channels").select("company_id, team_member_id").eq("phone_number", p.channel_number).maybeSingle()
          : { data: null };

        // Find an existing open thread for this contact on the SAME channel
        // number, else create one. Scoping by number keeps each employee's
        // conversations isolated from every other connected number.
        let threadId: string | null = null;
        let lookup = supabaseAdmin
          .from("communication_threads")
          .select("id")
          .eq("channel_type", p.channel)
          .eq("contact_handle", p.contact.handle)
          .neq("status", "Resolved");
        lookup = p.channel_number
          ? lookup.eq("channel_number", p.channel_number)
          : lookup.is("channel_number", null);
        const existing = await lookup
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing.error) {
          return Response.json({ error: "Lookup failed" }, { status: 500, headers: CORS });
        }
        threadId = existing.data?.id ?? null;


        if (!threadId) {
          const created = await supabaseAdmin
            .from("communication_threads")
            .insert({
              channel_type: p.channel,
              contact_name: p.contact.name ?? p.contact.handle,
              contact_handle: p.contact.handle,
              external_id: p.contact.external_id ?? null,
               subject: p.subject ?? null,
               channel_number: p.channel_number ?? null,
               assigned_to: p.assigned_to ?? channel?.team_member_id ?? null,
               company_id: channel?.company_id ?? null,
               status: "Open",
            })
            .select("id")
            .single();
          if (created.error || !created.data) {
            return Response.json(
              { error: "Could not create thread" },
              { status: 500, headers: CORS },
            );
          }
          threadId = created.data.id;
        }

        if (p.message) {
          const inserted = await supabaseAdmin.from("messages").insert({
            thread_id: threadId,
            sender_type: p.message.sender_type,
            sender_name: p.message.sender_name ?? p.contact.name ?? p.contact.handle,
            content: p.message.content,
            subject: p.subject ?? null,
            delivery_status: p.message.delivery_status ?? "delivered",
            metadata: (p.message.metadata ?? {}) as never,
          });
          if (inserted.error) {
            return Response.json({ error: "Could not store message" }, { status: 500, headers: CORS });
          }
        }

        if (p.call) {
          const call = await supabaseAdmin.from("call_logs").insert({
            thread_id: threadId,
            caller_name: p.contact.name ?? p.contact.handle,
            caller_number: p.contact.handle,
            call_type: p.call.call_type,
            duration_seconds: p.call.duration_seconds,
            status: p.call.status ?? (p.call.call_type === "Missed" ? "Missed" : "Completed"),
            notes: p.call.notes ?? null,
            recording_url: p.call.recording_url ?? null,
            transcript: p.call.transcript ?? null,
            agent_id: p.assigned_to ?? null,
          });
          if (call.error) {
            return Response.json({ error: "Could not store call log" }, { status: 500, headers: CORS });
          }
          await supabaseAdmin.from("messages").insert({
            thread_id: threadId,
            sender_type: "system",
            sender_name: "System",
            content:
              p.call.call_type === "Missed"
                ? "Missed call logged"
                : `${p.call.call_type} call – ${p.call.duration_seconds}s`,
          });
        }

        return Response.json({ ok: true, thread_id: threadId }, { headers: CORS });
      },
    },
  },
});
