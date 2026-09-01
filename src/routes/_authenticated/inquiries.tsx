import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchConversations, fetchInquiries } from "@/lib/crm-queries";
import { relativeTime } from "@/lib/format";
import { StatusPill } from "@/components/crm/StatusPill";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Transcript = { role: string; content: string }[];

export const Route = createFileRoute("/_authenticated/inquiries")({
  head: () => ({
    meta: [
      { title: "Leads & Chat Transcripts · Meemza CRM" },
      {
        name: "description",
        content:
          "Support tickets and sales leads captured by the Meemza AI assistant, with full chatbot transcripts and resolution status.",
      },
      { property: "og:title", content: "Leads & Chat Transcripts · Meemza CRM" },
      {
        property: "og:description",
        content: "AI-captured leads, support tickets and conversation transcripts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InquiriesPage,
});

function InquiriesPage() {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: inquiries = [] } = useQuery({ queryKey: ["inquiries"], queryFn: fetchInquiries });
  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("leads_inquiries").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inquiries"] });
      toast.success("Inquiry updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="display-title text-3xl">Leads &amp; Inquiries</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {inquiries.length} captured tickets · {conversations.length} chatbot sessions
        </p>
      </div>

      <section className="rounded-lg bg-panel border border-line divide-y divide-line/60 overflow-hidden">
        {inquiries.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {i.name ?? "Anonymous"} <span className="text-muted-foreground">· {i.inquiry_type}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {i.message ?? "No message"}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{i.source}</span>
            <StatusPill value={i.status} kind="inquiry" />
            <span className="text-xs text-muted-foreground w-24 text-right">
              {relativeTime(i.created_at)}
            </span>
            <div className="flex gap-2">
              {i.status !== "In Progress" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStatus.mutate({ id: i.id, status: "In Progress" })}
                >
                  Claim
                </Button>
              )}
              {i.status !== "Resolved" && (
                <Button
                  size="sm"
                  onClick={() => setStatus.mutate({ id: i.id, status: "Resolved" })}
                >
                  Resolve
                </Button>
              )}
            </div>
          </div>
        ))}
        {inquiries.length === 0 && (
          <div className="px-5 py-6 text-sm text-muted-foreground">No inquiries captured yet.</div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="display-title text-2xl">Chatbot Transcripts</h2>
        <div className="rounded-lg bg-panel border border-line divide-y divide-line/60 overflow-hidden">
          {conversations.map((c) => {
            const transcript = (Array.isArray(c.full_transcript)
              ? c.full_transcript
              : []) as unknown as Transcript;
            const isOpen = openId === c.id;
            return (
              <div key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : c.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-panel2/60 transition-colors"
                >
                  <span className="font-display font-semibold text-sm">{c.session_id}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {c.inquiry_topic ?? "General"}
                  </span>
                  <span
                    className={cn(
                      "ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded",
                      c.is_resolved_by_bot ? "bg-teal/10 text-teal" : "bg-brand/15 text-brand",
                    )}
                  >
                    {c.is_resolved_by_bot ? "BOT RESOLVED" : "ESCALATED"}
                  </span>
                  <span className="text-xs text-muted-foreground w-24 text-right">
                    {relativeTime(c.created_at)}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 space-y-2">
                    {transcript.map((m, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "max-w-[70%] rounded-md px-3 py-2 text-sm whitespace-pre-line",
                          m.role === "user"
                            ? "ml-auto bg-brand text-brand-foreground font-medium"
                            : "bg-panel2",
                        )}
                      >
                        {m.content}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
