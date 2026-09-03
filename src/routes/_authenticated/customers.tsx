import { QuickActionsBar } from "@/components/crm/QuickActionsBar";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Mail, MapPin, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchCustomers, fetchOrders, createCustomer, updateCustomer, deleteCustomer, type Customer } from "@/lib/crm-queries";
import { currency, shortDate } from "@/lib/format";
import { StatusPill } from "@/components/crm/StatusPill";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const SEGMENTS = ["All", "VIP", "Regular", "New", "At Risk"] as const;
type Form = { full_name: string; email: string; phone: string; shipping_address: string; customer_tag: string; notes: string };
const EMPTY: Form = { full_name: "", email: "", phone: "", shipping_address: "", customer_tag: "New", notes: "" };

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({ meta: [
    { title: "Customer Database · Meemza CRM" },
    { name: "description", content: "Manage live tenant customer records and order history." },
    { property: "og:title", content: "Customer Database · Meemza CRM" },
    { property: "og:description", content: "Live customer records and order history." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: CustomersPage,
});

function CustomersPage() {
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]>("All");
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Form>({ ...EMPTY });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error("Customer name is required");
      const input = { full_name: form.full_name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, shipping_address: form.shipping_address.trim() || null, customer_tag: form.customer_tag, notes: form.notes.trim() || null };
      if (editing) await updateCustomer(editing.id, input); else await createCustomer(input);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); setDialogOpen(false); setEditing(null); toast.success("Customer saved"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); queryClient.invalidateQueries({ queryKey: ["orders"] }); setActiveId(null); toast.success("Customer deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => { const q = search.trim().toLowerCase(); return customers.filter((c) => (segment === "All" || c.customer_tag === segment) && (!q || c.full_name.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q) || (c.phone ?? "").includes(q))); }, [customers, segment, search]);
  const active = filtered.find((c) => c.id === activeId) ?? filtered[0];
  const activeOrders = orders.filter((o) => o.customer_id === active?.id);

  function openCreate() { setEditing(null); setForm({ ...EMPTY }); setDialogOpen(true); }
  function openEdit(customer: Customer) { setEditing(customer); setForm({ full_name: customer.full_name, email: customer.email ?? "", phone: customer.phone ?? "", shipping_address: customer.shipping_address ?? "", customer_tag: customer.customer_tag, notes: customer.notes ?? "" }); setDialogOpen(true); }
  const field = (key: keyof Form, label: string, placeholder: string) => <div className="space-y-2"><Label htmlFor={`customer-${key}`}>{label}</Label><Input id={`customer-${key}`} value={form[key]} placeholder={placeholder} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} className="bg-panel2" /></div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="display-title text-3xl">Customer Database</h1><p className="text-sm text-muted-foreground mt-1">{filtered.length} profiles · live company records</p></div><div className="flex gap-2"><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone…" className="w-full sm:w-80 bg-panel2" /><Button onClick={openCreate}><Plus className="size-4" /> Add customer</Button></div></div>
    <div className="flex flex-wrap gap-1.5">{SEGMENTS.map((s) => <button key={s} type="button" onClick={() => setSegment(s)} className={cn("px-3 py-1.5 rounded text-xs font-medium transition-colors", segment === s ? "bg-panel2 text-foreground border border-line" : "text-muted-foreground hover:text-foreground")}>{s}</button>)}</div>
    <div className="grid gap-5 lg:grid-cols-5"><div className="lg:col-span-3 rounded-lg bg-panel border border-line divide-y divide-line/60 overflow-hidden">{filtered.map((c) => <button key={c.id} type="button" onClick={() => setActiveId(c.id)} className={cn("w-full flex items-center gap-4 px-5 py-4 text-left transition-colors", active?.id === c.id ? "bg-panel2" : "hover:bg-panel2/60")}><div className="size-9 shrink-0 rounded-full grid place-items-center bg-brand/15 text-brand font-display font-semibold text-sm">{c.full_name.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><div className="text-sm font-medium truncate">{c.full_name}</div><div className="text-xs text-muted-foreground truncate">{c.email ?? c.phone ?? "No contact details"}</div></div><div className="ml-auto text-right"><div className="text-sm">{currency(Number(c.total_spend ?? 0))}</div><div className="text-[11px] text-muted-foreground">{c.total_orders ?? 0} orders</div></div><StatusPill value={c.customer_tag} kind="tag" /></button>)}{filtered.length === 0 && <div className="px-5 py-8 text-sm text-muted-foreground text-center">{customers.length === 0 ? "No customers added yet." : "No customers found."}</div>}</div>
      <div className="lg:col-span-2 rounded-lg bg-panel border border-line p-6 h-fit">{active ? <><div className="flex items-center gap-3"><div className="size-12 rounded-full grid place-items-center bg-brand/15 text-brand font-display text-lg font-semibold">{active.full_name.slice(0, 2).toUpperCase()}</div><div className="min-w-0"><h2 className="display-title text-xl truncate">{active.full_name}</h2><StatusPill value={active.customer_tag} kind="tag" /></div><div className="ml-auto flex"><Button size="icon" variant="ghost" onClick={() => openEdit(active)} aria-label="Edit customer"><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" onClick={() => { if (window.confirm(`Delete ${active.full_name}?`)) remove.mutate(active.id); }} aria-label="Delete customer"><Trash2 className="size-4 text-destructive" /></Button></div></div><div className="mt-5 space-y-2 text-sm text-muted-foreground"><div className="flex items-center gap-2"><Mail className="size-4" /><span className="truncate">{active.email ?? "—"}</span></div><div className="flex items-center gap-2"><Phone className="size-4" />{active.phone ?? "—"}</div><div className="flex items-center gap-2"><MapPin className="size-4" /><span className="truncate">{active.shipping_address ?? "—"}</span></div></div><QuickActionsBar key={active.id} agentName="Agent" defaultContactName={active.full_name} defaultPhone={active.phone ?? ""} defaultEmail={active.email ?? ""} className="mt-5" /><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-md bg-panel2 p-3"><div className="eyebrow">Lifetime spend</div><div className="display-title text-2xl mt-1">{currency(Number(active.total_spend ?? 0))}</div></div><div className="rounded-md bg-panel2 p-3"><div className="eyebrow">Orders</div><div className="display-title text-2xl mt-1">{active.total_orders ?? 0}</div></div></div><div className="mt-6"><div className="eyebrow mb-3">Order log</div><div className="space-y-2">{activeOrders.map((o) => <div key={o.id} className="flex items-center gap-3 rounded-md bg-panel2 px-3 py-2 text-sm"><span className="font-display font-semibold">#{o.order_number}</span><span className="text-xs text-muted-foreground">{shortDate(o.created_at)}</span><span className="ml-auto">{currency(Number(o.total_amount))}</span><StatusPill value={o.order_status} /></div>)}{activeOrders.length === 0 && <p className="text-sm text-muted-foreground">No orders yet.</p>}</div></div></> : <p className="text-sm text-muted-foreground">Select a customer to view the profile.</p>}</div></div>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="display-title text-2xl">{editing ? "Edit customer" : "Add customer"}</DialogTitle><DialogDescription>Manage this company’s live customer record.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">{field("full_name", "Full name", "Customer name")}{field("email", "Email", "name@example.com")}{field("phone", "Phone", "+92…")}{field("customer_tag", "Segment", "New")}{field("shipping_address", "Shipping address", "Address")}</div><div className="space-y-2"><Label htmlFor="customer-notes">Notes</Label><Textarea id="customer-notes" value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} className="bg-panel2" /></div><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save customer"}</Button></DialogContent></Dialog>
  </div>;
}
