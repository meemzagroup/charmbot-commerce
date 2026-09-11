/**
 * THE single canonical WhatsApp conversation resolver.
 *
 * ONE WhatsApp contact  = ONE conversation per company + connected channel
 * ONE WhatsApp group    = ONE conversation per company + connected channel
 *
 * Identity is company_id + whatsapp_channel_id + normalized contact key
 * (derived from the remote JID). The same remote identity on two connected
 * company numbers is deliberately two conversations.
 *
 * Live webhook, history import and outgoing CRM messages MUST all resolve
 * through this function so no path can invent a second row.
 */

import { waContactKey, waStoredHandle, isGroupJid } from "@/lib/wa-identity";

export type WaChannelRef = {
  id: string;
  label?: string | null;
  phone_number?: string | null;
  team_member_id?: string | null;
  company_id: string;
};

export type ResolveInput = {
  companyId: string;
  jid: string;
  channel: WaChannelRef;
  /** Display name to use when the conversation has to be created. */
  displayName?: string | null;
  /** Real WhatsApp group subject, when known. */
  groupName?: string | null;
  subjectMark?: string | null;
  contactId?: string | null;
  externalId?: string | null;
  /** Reopen a resolved conversation on new activity (live/outgoing only). */
  reopen?: boolean;
};

export type ResolvedThread = {
  id: string;
  created: boolean;
  contactKey: string;
  handle: string;
  isGroup: boolean;
  contactName: string | null;
  subject: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
};

type AnyClient = {
  from: (table: string) => any;
};

export async function resolveOrCreateWhatsAppConversation(
  client: AnyClient,
  input: ResolveInput,
): Promise<ResolvedThread> {
  const contactKey = waContactKey(input.jid);
  const handle = waStoredHandle(input.jid);
  const isGroup = isGroupJid(input.jid);
  if (!contactKey) throw new Error("WhatsApp conversation identity could not be resolved");

  const existing = await client
    .from("communication_threads")
    .select("id, status, contact_name, subject, unread_count, last_message_at, whatsapp_channel_id")
    .eq("company_id", input.companyId)
    .eq("channel_type", "whatsapp")
    .eq("whatsapp_channel_id", input.channel.id)
    .eq("contact_key", contactKey)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.data?.id) {
    const patch: Record<string, unknown> = {};
    if (input.reopen && existing.data.status === "Resolved") patch["status"] = "Open";
    if (input.contactId) patch["contact_id"] = input.contactId;
    if (isGroup && input.groupName) {
      patch["contact_name"] = input.groupName;
      if (input.subjectMark) patch["subject"] = input.subjectMark;
    }
    if (Object.keys(patch).length) {
      await client
        .from("communication_threads")
        .update(patch)
        .eq("id", existing.data.id)
        .eq("company_id", input.companyId);
    }
    return {
      id: existing.data.id as string,
      created: false,
      contactKey,
      handle,
      isGroup,
      contactName: (patch["contact_name"] as string) ?? existing.data.contact_name ?? null,
      subject: (patch["subject"] as string) ?? existing.data.subject ?? null,
      unreadCount: Number(existing.data.unread_count ?? 0),
      lastMessageAt: existing.data.last_message_at ?? null,
    };
  }

  const created = await client
    .from("communication_threads")
    .insert({
      channel_type: "whatsapp",
      contact_name: (isGroup ? (input.groupName ?? input.displayName) : input.displayName) || handle,
      contact_handle: handle,
      channel_number: input.channel?.phone_number ?? null,
      whatsapp_channel_id: input.channel?.id ?? null,
      assigned_to: input.channel?.team_member_id ?? null,
      contact_id: input.contactId ?? null,
      external_id: input.externalId ?? null,
      company_id: input.companyId,
      subject:
        isGroup && input.groupName && input.subjectMark
          ? input.subjectMark
          : `WhatsApp · ${input.channel?.label ?? "Inbox"}`,
      status: "Open",
    })
    .select("id, contact_name, subject, unread_count, last_message_at")
    .single();

  if (!created.error && created.data) {
    return {
      id: created.data.id as string,
      created: true,
      contactKey,
      handle,
      isGroup,
      contactName: created.data.contact_name ?? null,
      subject: created.data.subject ?? null,
      unreadCount: 0,
      lastMessageAt: created.data.last_message_at ?? null,
    };
  }

  // A concurrent webhook/import already created the canonical conversation
  // (the unique index guarantees there can only ever be one). Use it.
  const retry = await client
    .from("communication_threads")
    .select("id, contact_name, subject, unread_count, last_message_at")
    .eq("company_id", input.companyId)
    .eq("channel_type", "whatsapp")
    .eq("whatsapp_channel_id", input.channel.id)
    .eq("contact_key", contactKey)
    .limit(1)
    .maybeSingle();
  if (!retry.data?.id) {
    throw new Error(created.error?.message ?? "Conversation could not be created");
  }
  return {
    id: retry.data.id as string,
    created: false,
    contactKey,
    handle,
    isGroup,
    contactName: retry.data.contact_name ?? null,
    subject: retry.data.subject ?? null,
    unreadCount: Number(retry.data.unread_count ?? 0),
    lastMessageAt: retry.data.last_message_at ?? null,
  };
}
