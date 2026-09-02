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

export async function sendAgentMessage(input: {
  threadId: string;
  content: string;
  senderName: string;
  subject?: string | null;
}) {
  const { error } = await supabase.from("messages").insert({
    thread_id: input.threadId,
    sender_type: "agent",
    sender_name: input.senderName,
    content: input.content,
    subject: input.subject ?? null,
    delivery_status: "sent",
  });
  if (error) throw error;
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

export async function createThreadWithMessage(input: {
  channel_type: ChannelType;
  contact_name: string;
  contact_handle: string;
  subject?: string | null;
  assigned_to?: string | null;
  content: string;
  senderName: string;
}) {
  const { data, error } = await supabase
    .from("communication_threads")
    .insert({
      channel_type: input.channel_type,
      contact_name: input.contact_name,
      contact_handle: input.contact_handle,
      subject: input.subject ?? null,
      assigned_to: input.assigned_to ?? null,
      status: "Open",
    })
    .select("id")
    .single();
  if (error) throw error;
  await sendAgentMessage({
    threadId: data.id,
    content: input.content,
    senderName: input.senderName,
    subject: input.subject ?? null,
  });
  return data.id;
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
  const { data: thread, error: threadError } = await supabase
    .from("communication_threads")
    .insert({
      channel_type: "call",
      contact_name: input.caller_name,
      contact_handle: input.caller_number,
      subject: `${input.call_type} call`,
      assigned_to: input.agent_id ?? null,
      status: input.call_type === "Missed" ? "Open" : "In Progress",
    })
    .select("id")
    .single();
  if (threadError) throw threadError;

  const { error } = await supabase.from("call_logs").insert({
    thread_id: thread.id,
    caller_name: input.caller_name,
    caller_number: input.caller_number,
    call_type: input.call_type,
    duration_seconds: input.duration_seconds,
    status: input.call_type === "Missed" ? "Missed" : "Completed",
    notes: input.notes ?? null,
    agent_id: input.agent_id ?? null,
    recording_url: input.recording_url ?? null,
  });
  if (error) throw error;

  await supabase.from("messages").insert({
    thread_id: thread.id,
    sender_type: "system",
    sender_name: "System",
    content:
      input.call_type === "Missed"
        ? "Missed call logged"
        : `${input.call_type} call completed – ${formatDuration(input.duration_seconds)}`,
  });
  return thread.id;
}

export function formatDuration(seconds: number | null | undefined) {
  const s = Math.max(0, Math.round(Number(seconds ?? 0)));
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export const WHATSAPP_TEMPLATES: { label: string; body: string }[] = [
  {
    label: "Order dispatched",
    body: "Good news! Your Meemza Chemicals order has been dispatched and will arrive in 2-4 working days. Tracking details follow shortly.",
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
