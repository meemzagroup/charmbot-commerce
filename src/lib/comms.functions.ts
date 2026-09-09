import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyModule } from "@/lib/plan.functions";

type SendResult = { messageId: string; deliveryStatus: string };

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

async function evolutionConfig() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("key, value")
    .in("key", ["evolution_api_url", "evolution_api_key"]);
  const map = Object.fromEntries((settings ?? []).map((row) => [row.key, (row.value ?? "").trim()]));
  const baseUrl = String(map["evolution_api_url"] ?? "").replace(/\/+$/, "");
  const apiKey = String(map["evolution_api_key"] ?? "");
  if (!baseUrl || !apiKey) throw new Error("WhatsApp sending is not configured by the platform owner");
  if (/^https?:\/\/\d{1,3}(\.\d{1,3}){3}(:\d+)?/i.test(baseUrl)) {
    throw new Error("The WhatsApp server needs a secure hostname before messages can be sent");
  }
  return { baseUrl, apiKey };
}

async function deliverWhatsapp(instanceKey: string, phone: string, content: string) {
  const { baseUrl, apiKey } = await evolutionConfig();
  const response = await fetch(`${baseUrl}/message/sendText/${encodeURIComponent(instanceKey)}`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ number: normalizePhone(phone), text: content }),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text().catch(() => "");
  if (!response.ok) throw new Error(`WhatsApp delivery failed (${response.status})`);
  try {
    return (JSON.parse(raw) as { key?: { id?: string } })?.key?.id ?? null;
  } catch {
    return null;
  }
}

export const sendThreadMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { threadId: string; content: string; senderName: string; subject?: string | null }) => {
    const threadId = String(input?.threadId ?? "").trim();
    const content = String(input?.content ?? "").trim();
    const senderName = String(input?.senderName ?? "Agent").trim().slice(0, 200);
    if (!threadId) throw new Error("Conversation is required");
    if (!content) throw new Error("Write a message first");
    if (content.length > 10_000) throw new Error("Message is too long");
    return { threadId, content, senderName: senderName || "Agent", subject: input.subject?.trim() || null };
  })
  .handler(async ({ data, context }): Promise<SendResult> => {
    await assertCompanyModule(context.supabase, context.userId, "inbox");
    const { supabase } = context as { supabase: any };
    const { data: thread, error: threadError } = await supabase
      .from("communication_threads")
      .select("id, channel_type, contact_handle, channel_number, company_id")
      .eq("id", data.threadId)
      .maybeSingle();
    if (threadError || !thread) throw new Error("Conversation is not available to this account");

    let externalId: string | null = null;
    let deliveryStatus = "sent";

    if (thread.channel_type === "email") {
      throw new Error("Email sending is not configured. Connect an email provider before sending replies.");
    }

    if (thread.channel_type === "whatsapp") {
      if (!thread.channel_number) throw new Error("Select a company WhatsApp channel before sending");
      const { data: channel } = await supabase
        .from("whatsapp_channels")
        .select("instance_key")
        .eq("company_id", thread.company_id)
        .eq("phone_number", thread.channel_number)
        .eq("is_active", true)
        .maybeSingle();
      if (!channel?.instance_key) throw new Error("The selected WhatsApp channel is not active or accessible");

      externalId = await deliverWhatsapp(channel.instance_key, thread.contact_handle, data.content);
      deliveryStatus = "sent";
    }

    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        thread_id: data.threadId,
        sender_type: "agent",
        sender_name: data.senderName,
        content: data.content,
        subject: data.subject,
        delivery_status: deliveryStatus,
        metadata: externalId ? { external_id: externalId } : {},
      })
      .select("id")
      .single();
    if (error || !message) throw new Error(error?.message ?? "Message could not be saved");
    return { messageId: message.id, deliveryStatus };
  });

export const createWhatsappConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    channelId: string;
    contactName: string;
    phone: string;
    content: string;
    senderName: string;
    assignedTo?: string | null;
  }) => {
    const channelId = String(input?.channelId ?? "").trim();
    const phone = String(input?.phone ?? "").trim();
    const content = String(input?.content ?? "").trim();
    if (!channelId) throw new Error("Select a WhatsApp channel");
    if (!normalizePhone(phone)) throw new Error("Recipient phone number is required");
    if (!content) throw new Error("Write a message first");
    if (content.length > 10_000) throw new Error("Message is too long");
    return {
      channelId,
      phone,
      content,
      contactName: String(input?.contactName ?? "").trim() || phone,
      senderName: String(input?.senderName ?? "Agent").trim().slice(0, 200) || "Agent",
      assignedTo: input?.assignedTo || null,
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyModule(context.supabase, context.userId, "whatsapp");
    const { supabase } = context as { supabase: any };
    const { data: channel, error: channelError } = await supabase
      .from("whatsapp_channels")
      .select("id, company_id, phone_number, instance_key")
      .eq("id", data.channelId)
      .eq("is_active", true)
      .maybeSingle();
    if (channelError || !channel?.instance_key || !channel.company_id) {
      throw new Error("The selected WhatsApp channel is not active or accessible");
    }

    if (data.assignedTo) {
      const { data: member } = await supabase
        .from("team_members")
        .select("id")
        .eq("id", data.assignedTo)
        .eq("company_id", channel.company_id)
        .maybeSingle();
      if (!member) throw new Error("The selected assignee is not available to this company");
    }

    const externalId = await deliverWhatsapp(channel.instance_key, data.phone, data.content);
    const { data: thread, error: threadError } = await supabase
      .from("communication_threads")
      .insert({
        channel_type: "whatsapp",
        contact_name: data.contactName,
        contact_handle: data.phone,
        channel_number: channel.phone_number,
        assigned_to: data.assignedTo,
        status: "Open",
      })
      .select("id")
      .single();
    if (threadError || !thread) throw new Error(threadError?.message ?? "Conversation could not be created");

    const { error: messageError } = await supabase.from("messages").insert({
      thread_id: thread.id,
      sender_type: "agent",
      sender_name: data.senderName,
      content: data.content,
      delivery_status: "sent",
      metadata: externalId ? { external_id: externalId } : {},
    });
    if (messageError) {
      await supabase.from("communication_threads").delete().eq("id", thread.id);
      throw new Error(messageError.message);
    }
    return { threadId: thread.id };
  });