import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type TeamMember = Tables<"team_members">;
export type CommThread = Tables<"communication_threads">;
export type CommMessage = Tables<"messages">;
export type CallLog = Tables<"call_logs">;

export type ChannelType = "whatsapp" | "email" | "call" | "webchat";
export type ThreadStatus = "Open" | "In Progress" | "Resolved";

export const CHANNELS: { key: ChannelType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "call", label: "Call Logs" },
  { key: "webchat", label: "Web Chat" },
];

export const THREAD_STATUSES: ThreadStatus[] = ["Open", "In Progress", "Resolved"];

export type ThreadWithAgent = CommThread & {
  team_members: Pick<TeamMember, "id" | "full_name" | "role_title"> | null;
};

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchThreads(): Promise<ThreadWithAgent[]> {
  const { data, error } = await supabase
    .from("communication_threads")
    .select("*, team_members(id, full_name, role_title)")
    .order("last_message_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ThreadWithAgent[];
}

export type ThreadPreview = {
  content: string;
  created_at: string;
  sender_type: string;
  sender_name: string | null;
  metadata: unknown;
};

/** Latest message per conversation, for WhatsApp-style list previews. */
export async function fetchThreadPreviews(): Promise<Record<string, ThreadPreview>> {
  const { data, error } = await supabase
    .from("messages")
    .select("thread_id, content, created_at, sender_type, sender_name, metadata")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const map: Record<string, ThreadPreview> = {};
  for (const m of data ?? []) {
    if (!m.thread_id || map[m.thread_id]) continue;
    map[m.thread_id] = {
      content: m.content,
      created_at: m.created_at,
      sender_type: m.sender_type,
      sender_name: m.sender_name ?? null,
      metadata: m.metadata,
    };
  }
  return map;
}

export async function fetchMessages(threadId: string): Promise<CommMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export type CallLogWithAgent = CallLog & {
  team_members: Pick<TeamMember, "id" | "full_name"> | null;
};

export async function fetchCallLogs(): Promise<CallLogWithAgent[]> {
  const { data, error } = await supabase
    .from("call_logs")
    .select("*, team_members(id, full_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CallLogWithAgent[];
}

export async function updateThread(
  id: string,
  patch: Partial<Pick<CommThread, "assigned_to" | "status" | "unread_count">>,
) {
  const { error } = await supabase.from("communication_threads").update(patch).eq("id", id);
  if (error) throw error;
}

export async function updateCallLog(id: string, patch: Partial<Pick<CallLog, "notes">>) {
  const { error } = await supabase.from("call_logs").update(patch).eq("id", id);
  if (error) throw error;
}

export async function logCall(input: {
  caller_name: string;
  caller_number: string;
  call_type: "Incoming" | "Outgoing" | "Missed";
  duration_seconds: number;
  notes?: string | null;
  agent_id?: string | null;
  recording_url?: string | null;
}) {
  const { data, error } = await supabase.rpc("log_call_atomic", {
    _caller_name: input.caller_name,
    _caller_number: input.caller_number,
    _call_type: input.call_type,
    _duration_seconds: input.duration_seconds,
    ...(input.notes ? { _notes: input.notes } : {}),
    ...(input.agent_id ? { _agent_id: input.agent_id } : {}),
    ...(input.recording_url ? { _recording_url: input.recording_url } : {}),
  });
  if (error) throw error;
  return data;
}

export function formatDuration(seconds: number | null | undefined) {
  const s = Math.max(0, Math.round(Number(seconds ?? 0)));
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export const WHATSAPP_TEMPLATES: { label: string; body: string }[] = [
  {
    label: "Order dispatched",
    body: "Good news! Your your company order has been dispatched and will arrive in 2-4 working days. Tracking details follow shortly.",
  },
  {
    label: "Quotation follow-up",
    body: "Assalam o alaikum, following up on the quotation we shared. Happy to revise quantities or terms — how would you like to proceed?",
  },
  {
    label: "Payment reminder",
    body: "A gentle reminder that your invoice is due. Bank details are on the invoice; please share the receipt once paid. Thank you.",
  },
];

export type WhatsappChannel = Tables<"whatsapp_channels">;

export type WhatsappChannelWithMember = WhatsappChannel & {
  team_members: Pick<TeamMember, "id" | "full_name" | "role_title"> | null;
};

export async function fetchWhatsappChannels(): Promise<WhatsappChannelWithMember[]> {
  const { data, error } = await supabase
    .from("whatsapp_channels")
    .select("*, team_members(id, full_name, role_title)")
    .order("label", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WhatsappChannelWithMember[];
}

function slugify(value: string) {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return base || "channel";
}

// The Evolution instance name is a technical identifier the user never types.
// It is derived from the display name plus a random suffix so two channels
// (even in different companies) can share the same friendly name.
export function generateInstanceKey(label: string) {
  const suffix =
    (globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2)).replace(/-/g, "").slice(0, 10);
  return `${slugify(label)}-${suffix}`;
}

export async function createWhatsappChannel(input: {
  label: string;
  phone_number: string;
  team_member_id?: string | null;
  department?: string | null;
  team_name?: string | null;
}) {
  const { error } = await supabase.from("whatsapp_channels").insert({
    label: input.label,
    phone_number: input.phone_number,
    team_member_id: input.team_member_id || null,
    department: input.department || null,
    team_name: input.team_name || null,
    instance_key: generateInstanceKey(input.label),
  });
  if (error) throw error;
}

export async function updateWhatsappChannel(
  id: string,
  patch: Partial<
    Pick<
      WhatsappChannel,
      "label" | "phone_number" | "team_member_id" | "is_active" | "department" | "team_name" | "last_connected_at"
    >
  >,
) {
  const { error } = await supabase.from("whatsapp_channels").update(patch).eq("id", id);
  if (error) throw error;
}


export async function deleteWhatsappChannel(id: string) {
  const { error } = await supabase.from("whatsapp_channels").delete().eq("id", id);
  if (error) throw error;
}

export type MyAccess = { isSuperAdmin: boolean; isCompanyAdmin: boolean; memberId: string | null };

export async function fetchMyAccess(): Promise<MyAccess> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { isSuperAdmin: false, isCompanyAdmin: false, memberId: null };
  const [{ data: profile }, { data: member }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("is_super_admin").eq("id", uid).maybeSingle(),
    supabase.from("team_members").select("id").eq("user_id", uid).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", uid),
  ]);
  return {
    isSuperAdmin: Boolean(profile?.is_super_admin),
    isCompanyAdmin: (roles ?? []).some((r) => r.role === "admin"),
    memberId: member?.id ?? null,
  };
}

