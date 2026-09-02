import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  MessageCircle,
  Mail,
  PhoneCall,
  MessagesSquare,
  SendHorizonal,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Play,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QuickActionsBar } from "@/components/crm/QuickActionsBar";
import { StatusPill } from "@/components/crm/StatusPill";
import { relativeTime, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CHANNELS,
  THREAD_STATUSES,
  fetchCallLogs,
  fetchMessages,
  fetchTeamMembers,
  fetchThreads,
  formatDuration,
  sendAgentMessage,
  updateCallLog,
  updateThread,
  type ChannelType,
  type ThreadWithAgent,
} from "@/lib/comms-queries";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Omnichannel Inbox · Meemza CRM" },
      {
        name: "description",
        content:
          "Unified WhatsApp, email, call log and web chat inbox for the Meemza sales and operations team, with rep assignment and reply composer.",
      },
      { property: "og:title", content: "Omnichannel Inbox · Meemza CRM" },
      {
        property: "og:description",
        content: "One activity feed for WhatsApp, email, phone calls and web chat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InboxPage,
});

const CHANNEL_ICON: Record<ChannelType, typeof MessageCircle> = {
  whatsapp: MessageCircle,
  email: Mail,
  call: PhoneCall,
  webchat: MessagesSquare,
};

const selectClass =
  "h-9 rounded-md bg-panel2 border border-line px-2.5 text-xs text-foreground";

function InboxPage() {
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const agentName =
    (user.user_metadata as { full_name?: string })?.full_name ||
    user.email?.split("@")[0] ||
    "Agent";

  const [channel, setChannel] = useState<ChannelType | "all">("all");
  const [repFilter, setRepFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const { data: threads = [] } = useQuery({ queryKey: ["comm-threads"], queryFn: fetchThreads });
  const { data: team = [] } = useQuery({ queryKey: ["team-members"], queryFn: fetchTeamMembers });
  const { data: calls = [] } = useQuery({ queryKey: ["call-logs"], queryFn: fetchCallLogs });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (channel !== "all" && t.channel_type !== channel) return false;
      if (repFilter !== "all" && (t.assigned_to ?? "unassigned") !== repFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return [t.contact_name, t.contact_handle, t.subject]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [threads, channel, repFilter, statusFilter, search]);

  const active: ThreadWithAgent | undefined =
    filtered.find((t) => t.id === activeId) ?? filtered[0];

  const { data: messages = [] } = useQuery({
    queryKey: ["comm-messages", active?.id],
    queryFn: () => fetchMessages(active!.id),
    enabled: !!active,
  });

  const activeCall = calls.find((c) => c.thread_id === active?.id);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["comm-threads"] });
    queryClient.invalidateQueries({ queryKey: ["comm-messages"] });
    queryClient.invalidateQueries({ queryKey: ["call-logs"] });
  };

  const send = useMutation({
    mutationFn: async () => {
      if (!active || !reply.trim()) throw new Error("Write a message first");
      await sendAgentMessage({
        threadId: active.id,
        content: reply.trim(),
        senderName: agentName,
        subject: active.channel_type === "email" ? `RE: ${active.subject ?? ""}` : null,
      });
    },
    onSuccess: () => {
      setReply("");
      invalidate();
      toast.success("Reply sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchThread = useMutation({
    mutationFn: (p: { id: string; assigned_to?: string | null; status?: string }) =>
      updateThread(p.id, {
        ...(p.assigned_to !== undefined ? { assigned_to: p.assigned_to } : {}),
        ...(p.status !== undefined ? { status: p.status } : {}),
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Thread updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveNotes = useMutation({
    mutationFn: (p: { id: string; notes: string }) => updateCallLog(p.id, { notes: p.notes }),
    onSuccess: () => {
      invalidate();
      toast.success("Follow-up notes saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: threads.length };
    for (const t of threads) map[t.channel_type] = (map[t.channel_type] ?? 0) + 1;
    return map;
  }, [threads]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="display-title text-3xl">Omnichannel Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {threads.length} conversations · {threads.filter((t) => t.status === "Open").length} open
            · {calls.length} calls logged
          </p>
        </div>
        <QuickActionsBar agentName={agentName} className="ml-auto" />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => {
              setChannel(c.key);
              setActiveId(null);
            }}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm transition-colors",
              channel === c.key
                ? "bg-panel2 text-foreground font-medium border border-brand/40"
                : "text-muted-foreground hover:text-foreground border border-transparent",
            )}
          >
            {c.label}
            <span className="ml-2 text-[10px] text-muted-foreground">{counts[c.key] ?? 0}</span>
          </button>
        ))}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contact, number, subject…"
            className="h-9 w-56 bg-panel2 border-line text-xs"
          />
          <select
            className={selectClass}
            value={repFilter}
            onChange={(e) => setRepFilter(e.target.value)}
          >
            <option value="all">All reps</option>
            <option value="unassigned">Unassigned</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            {THREAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-6 items-start">
        <section className="rounded-lg bg-panel border border-line divide-y divide-line/60 overflow-hidden max-h-[70vh] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-5 py-10 text-sm text-muted-foreground text-center">
              No conversations match these filters.
            </div>
          )}
          {filtered.map((t) => {
            const Icon = CHANNEL_ICON[t.channel_type as ChannelType] ?? MessagesSquare;
            const isActive = active?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                className={cn(
                  "w-full text-left px-4 py-3.5 flex gap-3 transition-colors",
                  isActive ? "bg-panel2 border-l-2 border-brand" : "hover:bg-panel2/50",
                )}
              >
                <Icon className={cn("size-4 mt-0.5 shrink-0", isActive && "text-brand")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {t.contact_name ?? t.contact_handle}
                    </span>
                    {t.unread_count > 0 && (
                      <span className="text-[10px] px-1.5 rounded bg-brand/15 text-brand font-semibold">
                        {t.unread_count}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                      {relativeTime(t.last_message_at)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.subject ?? t.contact_handle}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <StatusPill value={t.status} kind="inquiry" />
                    <span className="text-[10px] text-muted-foreground truncate">
                      {t.team_members?.full_name ?? "Unassigned"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        <section className="rounded-lg bg-panel border border-line overflow-hidden">
          {!active ? (
            <div className="px-6 py-16 text-sm text-muted-foreground text-center">
              Select a conversation to view the full thread.
            </div>
          ) : (
            <>
              <header className="px-5 py-4 border-b border-line flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {active.contact_name ?? active.contact_handle}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {active.contact_handle} · {active.channel_type} ·{" "}
                    {shortDate(active.last_message_at)}
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <select
                    className={selectClass}
                    value={active.assigned_to ?? ""}
                    onChange={(e) =>
                      patchThread.mutate({ id: active.id, assigned_to: e.target.value || null })
                    }
                  >
                    <option value="">Unassigned</option>
                    {team.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClass}
                    value={active.status}
                    onChange={(e) => patchThread.mutate({ id: active.id, status: e.target.value })}
                  >
                    {THREAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </header>

              {active.channel_type === "email" && active.subject && (
                <div className="px-5 py-3 border-b border-line text-sm">
                  <span className="text-muted-foreground text-xs">Subject · </span>
                  {active.subject}
                </div>
              )}

              {activeCall && (
                <div className="px-5 py-4 border-b border-line space-y-3 bg-panel2/40">
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    {activeCall.call_type === "Incoming" ? (
                      <PhoneIncoming className="size-4 text-teal" />
                    ) : activeCall.call_type === "Outgoing" ? (
                      <PhoneOutgoing className="size-4 text-brand" />
                    ) : (
                      <PhoneMissed className="size-4 text-destructive" />
                    )}
                    <span>{activeCall.call_type} call</span>
                    <span className="text-muted-foreground text-xs">
                      {formatDuration(activeCall.duration_seconds)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Agent: {activeCall.team_members?.full_name ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 rounded-md border border-line bg-panel px-3 py-2.5">
                    <Play className="size-4 text-brand" />
                    <div className="h-1.5 flex-1 rounded-full bg-line">
                      <div className="h-1.5 w-1/3 rounded-full bg-brand/70" />
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {activeCall.recording_url ? "Recording available" : "No recording attached"}
                    </span>
                  </div>
                  {activeCall.transcript && (
                    <div className="text-xs text-muted-foreground flex gap-2">
                      <FileText className="size-3.5 mt-0.5 shrink-0" />
                      <p className="leading-relaxed">{activeCall.transcript}</p>
                    </div>
                  )}
                  <CallNotes
                    key={activeCall.id}
                    initial={activeCall.notes ?? ""}
                    pending={saveNotes.isPending}
                    onSave={(notes) => saveNotes.mutate({ id: activeCall.id, notes })}
                  />
                </div>
              )}

              <div className="px-5 py-5 space-y-4 max-h-[46vh] overflow-y-auto">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">No messages in this thread yet.</p>
                )}
                {messages.map((m) => {
                  const outgoing = m.sender_type === "agent";
                  return (
                    <div
                      key={m.id}
                      className={cn("flex", outgoing ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-lg px-3.5 py-2.5 text-sm",
                          m.sender_type === "system"
                            ? "bg-panel2 text-muted-foreground text-xs mx-auto"
                            : outgoing
                              ? "bg-brand/15 text-foreground"
                              : "bg-panel2 text-foreground",
                        )}
                      >
                        {m.subject && (
                          <div className="text-[11px] text-muted-foreground mb-1">{m.subject}</div>
                        )}
                        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                        <div className="mt-1.5 text-[10px] text-muted-foreground flex gap-2">
                          <span>{m.sender_name ?? (outgoing ? "Agent" : "Customer")}</span>
                          <span>·</span>
                          <span>{relativeTime(m.created_at)}</span>
                          {outgoing && <span>· {m.delivery_status}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                className="px-5 py-4 border-t border-line flex items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  send.mutate();
                }}
              >
                <Textarea
                  rows={2}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder={
                    active.channel_type === "email"
                      ? "Write your email reply…"
                      : "Type a reply to the customer…"
                  }
                  className="bg-panel2 border-line resize-none"
                />
                <Button type="submit" disabled={send.isPending}>
                  <SendHorizonal className="size-4" />
                  {send.isPending ? "Sending…" : "Reply"}
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function CallNotes({
  initial,
  pending,
  onSave,
}: {
  initial: string;
  pending: boolean;
  onSave: (notes: string) => void;
}) {
  const [notes, setNotes] = useState(initial);
  return (
    <div className="space-y-2">
      <Textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Agent follow-up notes…"
        className="bg-panel border-line resize-none text-sm"
      />
      <Button size="sm" variant="outline" disabled={pending} onClick={() => onSave(notes)}>
        {pending ? "Saving…" : "Save notes"}
      </Button>
    </div>
  );
}
