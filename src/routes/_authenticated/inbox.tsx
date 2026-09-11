import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
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
  History,
  SlidersHorizontal,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useServerFn } from "@tanstack/react-start";
import { sendThreadMessage } from "@/lib/comms.functions";
import { syncWhatsappHistory } from "@/lib/whatsapp-history.functions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WhatsappMessageBody } from "@/components/crm/WhatsappMessageBody";
import { waPreviewText } from "@/lib/wa-message";
import { waIsGroupKey, waGroupFallbackName } from "@/lib/wa-identity";

/** Group rows show the WhatsApp group subject, never a member's name. */
function threadTitle(t: { contact_name: string | null; contact_handle: string | null; contact_key: string | null }) {
  if (waIsGroupKey(t.contact_key)) {
    return t.contact_name?.trim() || waGroupFallbackName(t.contact_key ?? "");
  }
  return t.contact_name ?? t.contact_handle;
}
import { QuickActionsBar } from "@/components/crm/QuickActionsBar";
import { StatusPill } from "@/components/crm/StatusPill";
import { relativeTime, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  CHANNELS,
  THREAD_STATUSES,
  fetchCallLogs,
  fetchMessages,
  fetchTeamMembers,
  fetchMyAccess,

  fetchThreads,
  fetchThreadPreviews,
  fetchWhatsappChannels,
  formatDuration,
  updateCallLog,
  updateThread,
  type ChannelType,
  type ThreadWithAgent,
} from "@/lib/comms-queries";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Omnichannel Inbox | Manuta CRM" },
      {
        name: "description",
        content:
          "Unified WhatsApp, email, call log and web chat inbox for your sales and operations team, with rep assignment and reply composer.",
      },
      { property: "og:title", content: "Omnichannel Inbox | Manuta CRM" },
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
  "h-11 w-full rounded-md bg-panel2 border border-line px-2.5 text-sm text-foreground sm:h-9 sm:w-auto sm:text-xs";

function InboxPage() {
  const queryClient = useQueryClient();
  const { user } = Route.useRouteContext();
  const agentName =
    (user.user_metadata as { full_name?: string })?.full_name ||
    user.email?.split("@")[0] ||
    "Agent";

  const [channel, setChannel] = useState<ChannelType | "all">("all");
  const [repFilter, setRepFilter] = useState<string>("all");
  const [waNumberFilter, setWaNumberFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: threads = [] } = useQuery({ queryKey: ["comm-threads"], queryFn: fetchThreads });
  const { data: previews = {} } = useQuery({
    queryKey: ["comm-thread-previews"],
    queryFn: fetchThreadPreviews,
  });
  const { data: team = [] } = useQuery({ queryKey: ["team-members"], queryFn: fetchTeamMembers });
  const { data: calls = [] } = useQuery({ queryKey: ["call-logs"], queryFn: fetchCallLogs });
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: fetchMyAccess });
  const isSuperAdmin = Boolean(access?.isSuperAdmin);
  const canAssign = Boolean(access?.isSuperAdmin || access?.isCompanyAdmin);
  const sendMessage = useServerFn(sendThreadMessage);
  const syncHistory = useServerFn(syncWhatsappHistory);

  const { data: waChannels = [] } = useQuery({
    queryKey: ["whatsapp-channels"],
    queryFn: fetchWhatsappChannels,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (channel !== "all" && t.channel_type !== channel) return false;
      if (repFilter !== "all" && (t.assigned_to ?? "unassigned") !== repFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (waNumberFilter !== "all") {
        const ch = waChannels.find((c) => c.id === waNumberFilter);
        if (!ch) return false;
        const matches =
          t.channel_type === "whatsapp" &&
          (t.whatsapp_channel_id === ch.id ||
            (!t.whatsapp_channel_id && t.channel_number === ch.phone_number));
        if (!matches) return false;
      }
      if (!q) return true;
      return [t.contact_name, t.contact_handle, t.subject]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [threads, channel, repFilter, statusFilter, search, waNumberFilter, waChannels]);

  const active: ThreadWithAgent | undefined =
    filtered.find((t) => t.id === activeId) ?? (isMobile ? undefined : filtered[0]);
  // On phones the inbox is a two-screen messaging app: list, then full-screen chat.
  const showChat = !isMobile || Boolean(active);

  const { data: messages = [] } = useQuery({
    queryKey: ["comm-messages", active?.id],
    queryFn: () => fetchMessages(active!.id),
    enabled: !!active,
  });

  // WhatsApp-style: one continuous thread, oldest to newest.
  const orderedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [messages],
  );

  const activeCall = calls.find((c) => c.thread_id === active?.id);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["comm-threads"] });
    queryClient.invalidateQueries({ queryKey: ["comm-messages"] });
    queryClient.invalidateQueries({ queryKey: ["comm-thread-previews"] });
    queryClient.invalidateQueries({ queryKey: ["call-logs"] });
  };

  useEffect(() => {
    const live = supabase
      .channel(`inbox-live-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "communication_threads" }, () => {
        queryClient.invalidateQueries({ queryKey: ["comm-threads"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["comm-threads"] });
        queryClient.invalidateQueries({ queryKey: ["comm-messages"] });
        queryClient.invalidateQueries({ queryKey: ["comm-thread-previews"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(live);
    };
  }, [queryClient, user.id]);

  const send = useMutation({
    mutationFn: async () => {
      if (!active || !reply.trim()) throw new Error("Write a message first");
      await sendMessage({ data: {
        threadId: active.id,
        content: reply.trim(),
        senderName: agentName,
        subject: active.channel_type === "email" ? `RE: ${active.subject ?? ""}` : null,
      } });
    },
    onSuccess: () => {
      setReply("");
      invalidate();
      toast.success("Reply sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importHistory = useMutation({
    mutationFn: async () => {
      const targets =
        waNumberFilter === "all" ? waChannels : waChannels.filter((c) => c.id === waNumberFilter);
      if (targets.length === 0) throw new Error("No WhatsApp number is connected yet");
      let imported = 0;
      const problems: string[] = [];
      for (const c of targets) {
        try {
          const result = await syncHistory({ data: { channelId: c.id } });
          imported += result.importedMessages;
        } catch (e) {
          problems.push(`${c.label}: ${(e as Error).message}`);
        }
      }
      if (imported === 0 && problems.length) throw new Error(problems[0]!);
      return { imported, problems };
    },
    onSuccess: (r) => {
      invalidate();
      toast.success(
        r.imported > 0
          ? `Imported ${r.imported} past message${r.imported === 1 ? "" : "s"}.`
          : "No new past messages found — your inbox is already up to date.",
      );
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

  const filterControls = (
    <>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search contact, number, subject…"
        aria-label="Search conversations"
        className="h-11 w-full bg-panel2 border-line text-sm sm:h-9 sm:w-56 sm:text-xs"
      />
      <select
        aria-label="Filter by rep"
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
      {waChannels.length > 0 && (
        <select
          aria-label="Filter by WhatsApp number"
          className={selectClass}
          value={waNumberFilter}
          onChange={(e) => {
            setWaNumberFilter(e.target.value);
            setActiveId(null);
          }}
        >
          <option value="all">All WhatsApp numbers</option>
          {waChannels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} · {c.phone_number}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Filter by status"
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
      {waChannels.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 w-full sm:h-9 sm:w-auto"
          disabled={importHistory.isPending}
          onClick={() => importHistory.mutate()}
          title="Bring older WhatsApp chats from the connected phone into this inbox"
        >
          <History className="size-4" />
          {importHistory.isPending ? "Importing…" : "Import past chats"}
        </Button>
      )}
    </>
  );

  const chatOpenOnMobile = isMobile && Boolean(active);

  return (
    <div className="space-y-4 md:space-y-6">
      {!chatOpenOnMobile && (
        <div className="flex flex-wrap items-end gap-3 md:gap-4">
          <div>
            <h1 className="display-title text-2xl md:text-3xl">Omnichannel Inbox</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {threads.length} conversations ·{" "}
              {threads.filter((t) => t.status === "Open").length} open · {calls.length} calls logged
            </p>
          </div>
          <QuickActionsBar agentName={agentName} className="w-full sm:w-auto sm:ml-auto" />
        </div>
      )}

      {!chatOpenOnMobile && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <div className="-mx-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 sm:flex-none sm:overflow-visible">
            {CHANNELS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setChannel(c.key);
                  setActiveId(null);
                }}
                className={cn(
                  "shrink-0 rounded-md px-3 py-2 text-sm transition-colors sm:py-1.5",
                  channel === c.key
                    ? "bg-panel2 text-foreground font-medium border border-brand/40"
                    : "text-muted-foreground hover:text-foreground border border-transparent",
                )}
              >
                {c.label}
                <span className="ml-2 text-[10px] text-muted-foreground">{counts[c.key] ?? 0}</span>
              </button>
            ))}
          </div>

          {isMobile ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 shrink-0"
              onClick={() => setFiltersOpen(true)}
            >
              <SlidersHorizontal className="size-4" /> Filters
            </Button>
          ) : (
            <div className="ml-auto flex flex-wrap items-center gap-2">{filterControls}</div>
          )}
        </div>
      )}

      {isMobile && (
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent
            side="bottom"
            className="bg-panel border-line max-h-[85dvh] overflow-y-auto rounded-t-xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          >
            <SheetHeader>
              <SheetTitle className="display-title text-lg">Filter conversations</SheetTitle>
            </SheetHeader>
            <div className="mt-4 flex flex-col gap-3">{filterControls}</div>
            <Button className="mt-5 h-11 w-full" onClick={() => setFiltersOpen(false)}>
              Show results
            </Button>
          </SheetContent>
        </Sheet>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr] lg:gap-6 items-start">
        <section
          className={cn(
            "rounded-lg bg-panel border border-line divide-y divide-line/60 overflow-hidden max-h-[70vh] overflow-y-auto",
            chatOpenOnMobile && "hidden lg:block",
          )}
        >
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
                      {threadTitle(t)}
                    </span>
                    {waIsGroupKey(t.contact_key) && (
                      <span className="text-[10px] px-1.5 rounded bg-panel2 text-muted-foreground font-semibold shrink-0">
                        Group
                      </span>
                    )}
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
                    {previews[t.id]
                      ? `${
                          previews[t.id]!.sender_type === "agent"
                            ? "You: "
                            : waIsGroupKey(t.contact_key) && previews[t.id]!.sender_name
                              ? `${previews[t.id]!.sender_name}: `
                              : ""
                        }${waPreviewText(previews[t.id]!.content, previews[t.id]!.metadata)}`
                      : (t.subject ?? t.contact_handle)}
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

        <section
          className={cn(
            "rounded-lg bg-panel border border-line overflow-hidden",
            !showChat && "hidden lg:block",
          )}
        >
          {!active ? (
            <div className="px-6 py-16 text-sm text-muted-foreground text-center">
              Select a conversation to view the full thread.
            </div>
          ) : (
            <>
              <header className="px-4 py-3 md:px-5 md:py-4 border-b border-line flex flex-wrap items-center gap-3">
                {isMobile && (
                  <button
                    type="button"
                    aria-label="Back to conversations"
                    onClick={() => setActiveId(null)}
                    className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="size-5" />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {threadTitle(active)}
                    {waIsGroupKey(active.contact_key) && (
                      <span className="ml-2 text-[10px] px-1.5 rounded bg-panel2 text-muted-foreground font-semibold">
                        Group
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {active.contact_handle} · {active.channel_type} ·{" "}
                    {shortDate(active.last_message_at)}
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 items-center gap-2 sm:ml-auto sm:flex sm:w-auto sm:flex-wrap">
                   {canAssign ? (
                    <select
                      aria-label="Assign conversation to rep"
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
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {active.team_members?.full_name ?? "Unassigned"}
                    </span>
                  )}

                  <select
                    aria-label="Conversation status"
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

              <div className="px-4 py-4 md:px-5 md:py-5 space-y-4 h-[calc(100dvh-24rem)] min-h-[16rem] max-h-none overflow-y-auto lg:h-auto lg:max-h-[46vh]">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">No messages in this thread yet.</p>
                )}
                {orderedMessages.map((m, i) => {
                  const outgoing = m.sender_type === "agent";
                  const day = new Date(m.created_at).toDateString();
                  const prev = orderedMessages[i - 1];
                  const newDay = !prev || new Date(prev.created_at).toDateString() !== day;
                  return (
                    <div key={m.id}>
                      {newDay && (
                        <div className="flex justify-center my-3">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-panel2 rounded-full px-3 py-1">
                            {shortDate(m.created_at)}
                          </span>
                        </div>
                      )}
                    <div
                      className={cn("flex flex-col", outgoing ? "items-end" : "items-start")}
                    >
                      {!outgoing && m.sender_type !== "system" && waIsGroupKey(active.contact_key) && (
                        <span className="mb-1 text-[11px] font-medium text-brand">
                          {m.sender_name ?? "Member"}
                        </span>
                      )}
                      <div
                        className={cn(
                          "max-w-[88%] rounded-lg px-3.5 py-2.5 text-sm sm:max-w-[75%]",
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
                        <WhatsappMessageBody message={m} />
                        <div className="mt-1.5 text-[10px] text-muted-foreground flex gap-2">
                          <span>{m.sender_name ?? (outgoing ? "Agent" : "Customer")}</span>
                          <span>·</span>
                          <span>{relativeTime(m.created_at)}</span>
                          {outgoing && <span>· {m.delivery_status}</span>}
                        </div>
                      </div>
                    </div>
                    </div>
                  );
                })}
              </div>

              <form
                className="sticky bottom-0 bg-panel px-4 py-3 md:px-5 md:py-4 border-t border-line flex items-end gap-2 md:gap-3"
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
                <Button type="submit" disabled={send.isPending} className="h-11 shrink-0 px-3 sm:px-4">
                  <SendHorizonal className="size-4" />
                  <span className="hidden sm:inline">{send.isPending ? "Sending…" : "Reply"}</span>
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
