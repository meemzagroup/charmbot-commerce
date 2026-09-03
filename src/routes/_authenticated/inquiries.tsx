import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchConversations, fetchInquiries, createInquiry, updateInquiry, deleteInquiry, type Inquiry } from "@/lib/crm-queries";
import { relativeTime } from "@/lib/format";
import { StatusPill } from "@/components/crm/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Transcript = { role: string; content: string }[];
type Form = { name: string; phone: string; email: string; message: string; inquiry_type: string; status: string; source: string };
const EMPTY: Form = { name: "", phone: "", email: "", message: "", inquiry_type: "General", status: "Open", source: "Manual" };

export const Route = createFileRoute("/_authenticated/inquiries")({
  head: () => ({ meta: [
    { title: "Leads & Inquiries · Meemza CRM" },
    { name: "description", content: "Manage live tenant leads, inquiries and chatbot transcripts." },
    { property: "og:title", content: "Leads & Inquiries · Meemza CRM" },
    { property: "og:description", content: "Live tenant leads and support inquiries." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: InquiriesPage,
});

function InquiriesPage() {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Inquiry | null>(null);
  const [form, setForm] = useState<Form>({ ...EMPTY });
  const { data: inquiries = [] } = useQuery({ queryKey: ["inquiries"], queryFn: fetchInquiries });
  const { data: conversations = [] } = useQuery({ queryKey: ["conversations"], queryFn: fetchConversations });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.message.trim() && !form.name.trim()) throw new Error("Add a name or message");
      const input = { name: form.name.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null, message: form.message.trim() || null, inquiry_type: form.inquiry_type.trim() || "General", status: form.status, source: form.source.trim() || "Manual" };
      if (editing) await updateInquiry(editing.id, input); else await createInquiry(input);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inquiries"] }); setDialogOpen(false); setEditing(null); toast.success("Inquiry saved"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({ mutationFn: deleteInquiry, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inquiries"] }); toast.success("Inquiry deleted"); }, onError: (e: Error) => toast.error(e.message) });
  const setStatus = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => updateInquiry(id, { status }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["inquiries"] }); toast.success("Inquiry updated"); }, onError: (e: Error) => toast.error(e.message) });

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setDialogOpen(true); }
  function openEdit(inquiry: Inquiry) { setEditing(inquiry); setForm({ name: inquiry.name ?? "", phone: inquiry.phone ?? "", email: inquiry.email ?? "", message: inquiry.message ?? "", inquiry_type: inquiry.inquiry_type, status: inquiry.status, source: inquiry.source }); setDialogOpen(true); }
  const field = (key: keyof Form, label: string, placeholder: string) => <div className="space-y-2"><Label htmlFor={`inquiry-${key}`}>{label}</Label><Input id={`inquiry-${key}`} value={form[key]} placeholder={placeholder} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} className="bg-panel2" /></div>;

  return <div className="space-y-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="display-title text-3xl">Leads &amp; Inquiries</h1><p className="text-sm text-muted-foreground mt-1">{inquiries.length} live tickets · {conversations.length} chatbot sessions</p></div><Button onClick={openCreate}><Plus className="size-4" /> Add inquiry</Button></div>
    <section className="rounded-lg bg-panel border border-line divide-y divide-line/60 overflow-hidden">{inquiries.map((i) => <div key={i.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{i.name ?? "Anonymous"} <span className="text-muted-foreground">· {i.inquiry_type}</span></div><div className="text-xs text-muted-foreground truncate">{i.message ?? "No message"}</div></div><span className="text-xs text-muted-foreground">{i.source}</span><StatusPill value={i.status} kind="inquiry" /><span className="text-xs text-muted-foreground w-24 text-right">{relativeTime(i.created_at)}</span><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => openEdit(i)} aria-label="Edit inquiry"><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" onClick={() => { if (window.confirm("Delete this inquiry?")) remove.mutate(i.id); }} aria-label="Delete inquiry"><Trash2 className="size-4 text-destructive" /></Button>{i.status !== "In Progress" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: i.id, status: "In Progress" })}>Claim</Button>}{i.status !== "Resolved" && <Button size="sm" onClick={() => setStatus.mutate({ id: i.id, status: "Resolved" })}>Resolve</Button>}</div></div>)}{inquiries.length === 0 && <div className="px-5 py-8 text-sm text-muted-foreground text-center">No inquiries captured yet.</div>}</section>
    <section className="space-y-3"><h2 className="display-title text-2xl">Chatbot Transcripts</h2><div className="rounded-lg bg-panel border border-line divide-y divide-line/60 overflow-hidden">{conversations.map((c) => { const transcript = (Array.isArray(c.full_transcript) ? c.full_transcript : []) as unknown as Transcript; const isOpen = openId === c.id; return <div key={c.id}><button type="button" onClick={() => setOpenId(isOpen ? null : c.id)} className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-panel2/60 transition-colors"><span className="font-display font-semibold text-sm">{c.session_id}</span><span className="text-xs text-muted-foreground truncate">{c.inquiry_topic ?? "General"}</span><span className={cn("ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded", c.is_resolved_by_bot ? "bg-teal/10 text-teal" : "bg-brand/15 text-brand")}>{c.is_resolved_by_bot ? "BOT RESOLVED" : "ESCALATED"}</span><span className="text-xs text-muted-foreground w-24 text-right">{relativeTime(c.created_at)}</span></button>{isOpen && <div className="px-5 pb-4 space-y-2">{transcript.map((m, idx) => <div key={idx} className={cn("max-w-[70%] rounded-md px-3 py-2 text-sm whitespace-pre-line", m.role === "user" ? "ml-auto bg-brand text-brand-foreground font-medium" : "bg-panel2")}>{m.content}</div>)}</div>}</div>; })}{conversations.length === 0 && <div className="px-5 py-8 text-sm text-muted-foreground text-center">No chatbot transcripts yet.</div>}</div></section>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="display-title text-2xl">{editing ? "Edit inquiry" : "Add inquiry"}</DialogTitle><DialogDescription>Manage this company’s live inquiry record.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">{field("name", "Name", "Customer name")}{field("phone", "Phone", "+92…")}{field("email", "Email", "name@example.com")}{field("inquiry_type", "Inquiry type", "General")}{field("status", "Status", "Open")}{field("source", "Source", "Manual")}</div><div className="space-y-2"><Label htmlFor="inquiry-message">Message</Label><Textarea id="inquiry-message" value={form.message} onChange={(e) => setForm((current) => ({ ...current, message: e.target.value }))} className="bg-panel2" /></div><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save inquiry"}</Button></DialogContent></Dialog>
  </div>;
}
