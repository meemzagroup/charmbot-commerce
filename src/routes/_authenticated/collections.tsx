import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote, Plus, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyRow, PageHeader, Panel, Pill, StatCard, selectClass } from "@/components/crm/WorkforceUI";
import { fetchMyAccess, fetchTeamMembers } from "@/lib/comms-queries";
import { fetchCustomers, fetchOrders, fetchProducts } from "@/lib/crm-queries";
import {
  collectionStatus,
  insertRow,
  listRows,
  recordCollectionPayment,
  startOfToday,
} from "@/lib/workforce-queries";
import { currency, shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/collections")({
  component: CollectionsPage,
  head: () => ({
    meta: [
      { title: "Recovery & Competitor Intelligence | Salforce AI" },
      {
        name: "description",
        content:
          "Track receivables, overdue recovery, partial payments and field-captured competitor pricing and activity.",
      },
      { property: "og:title", content: "Recovery & Competitor Intelligence | Salforce AI" },
      { property: "og:description", content: "Receivables recovery and market intelligence for the sales force." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function CollectionsPage() {
  const qc = useQueryClient();
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: fetchMyAccess });
  const canManage = Boolean(access?.isSuperAdmin || access?.isCompanyAdmin);

  const { data: rows = [] } = useQuery({ queryKey: ["collections"], queryFn: () => listRows("collections") });
  const { data: intel = [] } = useQuery({ queryKey: ["competitor-intel"], queryFn: () => listRows("competitor_intel") });
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: fetchProducts });
  const { data: members = [] } = useQuery({ queryKey: ["team-members"], queryFn: fetchTeamMembers });

  const invalidate = () =>
    ["collections", "competitor-intel"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const [form, setForm] = useState({ customer_id: "", order_id: "", team_member_id: "", amount_due: "", due_date: "" });
  const add = useMutation({
    mutationFn: () => {
      if (!form.customer_id) throw new Error("Select a customer.");
      if (Number(form.amount_due) <= 0) throw new Error("Amount due must be greater than zero.");
      return insertRow("collections", {
        customer_id: form.customer_id,
        order_id: form.order_id || null,
        team_member_id: form.team_member_id || access?.memberId || null,
        amount_due: Number(form.amount_due),
        due_date: form.due_date || null,
        status: collectionStatus({ amount_due: Number(form.amount_due), amount_collected: 0, due_date: form.due_date || null }),
      });
    },
    onSuccess: () => {
      setForm({ customer_id: "", order_id: "", team_member_id: "", amount_due: "", due_date: "" });
      invalidate();
      toast.success("Receivable added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [intelForm, setIntelForm] = useState({
    competitor_name: "",
    product_name: "",
    our_product_id: "",
    competitor_price: "",
    our_price: "",
    activity: "",
    customer_id: "",
  });
  const addIntel = useMutation({
    mutationFn: () => {
      if (!intelForm.competitor_name) throw new Error("Competitor name is required.");
      return insertRow("competitor_intel", {
        competitor_name: intelForm.competitor_name,
        product_name: intelForm.product_name || null,
        our_product_id: intelForm.our_product_id || null,
        competitor_price: intelForm.competitor_price ? Number(intelForm.competitor_price) : null,
        our_price: intelForm.our_price ? Number(intelForm.our_price) : null,
        activity: intelForm.activity || null,
        customer_id: intelForm.customer_id || null,
        team_member_id: access?.memberId ?? null,
      });
    },
    onSuccess: () => {
      setIntelForm({ competitor_name: "", product_name: "", our_product_id: "", competitor_price: "", our_price: "", activity: "", customer_id: "" });
      invalidate();
      toast.success("Market intelligence captured");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalDue = rows.reduce((s, r) => s + Number(r.amount_due ?? 0), 0);
  const totalGot = rows.reduce((s, r) => s + Number(r.amount_collected ?? 0), 0);
  const overdue = rows.filter(
    (r) => r.status !== "Cleared" && r.status !== "Written Off" && r.due_date && new Date(r.due_date) < startOfToday(),
  );
  const customerName = (id: string | null) => customers.find((c) => c.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Banknote}
        title="Recovery & Market Intelligence"
        subtitle="Receivables, overdue recovery and competitor pricing captured from the field."
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Total receivable" value={currency(totalDue)} />
        <StatCard label="Recovered" value={currency(totalGot)} tone="text-teal" />
        <StatCard label="Outstanding" value={currency(totalDue - totalGot)} />
        <StatCard label="Overdue accounts" value={String(overdue.length)} tone={overdue.length ? "text-red-400" : undefined} />
      </div>

      <Panel title="Add receivable">
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="space-y-2">
            <Label htmlFor="c_cust">Customer</Label>
            <select id="c_cust" className={selectClass} value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
              <option value="">Select…</option>
              {customers.map((c) => (<option key={c.id} value={c.id}>{c.full_name}</option>))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c_order">Order</Label>
            <select id="c_order" className={selectClass} value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })}>
              <option value="">None</option>
              {orders.slice(0, 100).map((o) => (<option key={o.id} value={o.id}>{o.order_number}</option>))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c_owner">Responsible</Label>
            <select id="c_owner" className={selectClass} value={form.team_member_id} onChange={(e) => setForm({ ...form, team_member_id: e.target.value })}>
              <option value="">Me</option>
              {members.map((m) => (<option key={m.id} value={m.id}>{m.full_name}</option>))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="c_amt">Amount due</Label>
            <Input id="c_amt" type="number" min="0" className="bg-panel2" value={form.amount_due} onChange={(e) => setForm({ ...form, amount_due: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c_due">Due date</Label>
            <Input id="c_due" type="date" className="bg-panel2" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
          </div>
        </div>
        <Button onClick={() => add.mutate()} disabled={add.isPending}><Plus className="size-4" /> Add receivable</Button>
      </Panel>

      <div className="space-y-2">
        {rows.length === 0 && <EmptyRow>No receivables recorded.</EmptyRow>}
        {rows.map((r) => (
          <CollectionRow
            key={r.id}
            row={r}
            label={customerName(r.customer_id)}
            owner={members.find((m) => m.id === r.team_member_id)?.full_name ?? "Unassigned"}
            canManage={canManage}
            onChanged={invalidate}
          />
        ))}
      </div>

      <Panel title="Competitor intelligence" description="Field-captured pricing and activity feeds product and pricing decisions.">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-2">
            <Label htmlFor="i_comp">Competitor</Label>
            <Input id="i_comp" className="bg-panel2" value={intelForm.competitor_name} onChange={(e) => setIntelForm({ ...intelForm, competitor_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="i_prod">Their product</Label>
            <Input id="i_prod" className="bg-panel2" value={intelForm.product_name} onChange={(e) => setIntelForm({ ...intelForm, product_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="i_our">Our product</Label>
            <select id="i_our" className={selectClass} value={intelForm.our_product_id} onChange={(e) => setIntelForm({ ...intelForm, our_product_id: e.target.value })}>
              <option value="">—</option>
              {products.map((p) => (<option key={p.id} value={p.id}>{p.title}</option>))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="i_cprice">Their price</Label>
            <Input id="i_cprice" type="number" min="0" className="bg-panel2" value={intelForm.competitor_price} onChange={(e) => setIntelForm({ ...intelForm, competitor_price: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="i_oprice">Our price</Label>
            <Input id="i_oprice" type="number" min="0" className="bg-panel2" value={intelForm.our_price} onChange={(e) => setIntelForm({ ...intelForm, our_price: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="i_act">Activity</Label>
            <Input id="i_act" className="bg-panel2" value={intelForm.activity} onChange={(e) => setIntelForm({ ...intelForm, activity: e.target.value })} placeholder="Scheme / discount" />
          </div>
        </div>
        <Button onClick={() => addIntel.mutate()} disabled={addIntel.isPending}><Swords className="size-4" /> Capture</Button>

        <div className="space-y-2">
          {intel.length === 0 && <EmptyRow>No competitor data captured yet.</EmptyRow>}
          {intel.map((i) => {
            const diff =
              i.competitor_price != null && i.our_price != null
                ? Number(i.our_price) - Number(i.competitor_price)
                : null;
            return (
              <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2 px-3 py-2 text-sm">
                <span className="font-medium">{i.competitor_name}</span>
                <span className="text-xs text-muted-foreground">{i.product_name ?? "—"} · {shortDate(i.captured_on)}</span>
                {i.competitor_price != null && <span className="text-xs">Them {currency(Number(i.competitor_price))}</span>}
                {i.our_price != null && <span className="text-xs">Us {currency(Number(i.our_price))}</span>}
                {diff != null && (
                  <Pill tone={diff > 0 ? "red" : "green"}>{diff > 0 ? `We are ${currency(diff)} costlier` : `We are ${currency(Math.abs(diff))} cheaper`}</Pill>
                )}
                {i.activity ? <span className="text-xs text-muted-foreground">{i.activity}</span> : null}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

type Collection = Awaited<ReturnType<typeof listRows<"collections">>>[number];

function CollectionRow({
  row,
  label,
  owner,
  canManage,
  onChanged,
}: {
  row: Collection;
  label: string;
  owner: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [amount, setAmount] = useState("");
  const outstanding = Number(row.amount_due ?? 0) - Number(row.amount_collected ?? 0);
  const status = collectionStatus(row);

  const pay = useMutation({
    mutationFn: () => recordCollectionPayment(row, Number(amount || 0)),
    onSuccess: () => {
      setAmount("");
      onChanged();
      toast.success("Payment recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-sm">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">
          {owner} · due {row.due_date ? shortDate(row.due_date) : "—"}
        </div>
      </div>
      <span className="text-xs">{currency(Number(row.amount_collected ?? 0))} / {currency(Number(row.amount_due ?? 0))}</span>
      <Pill tone={status === "Cleared" ? "green" : status === "Overdue" ? "red" : "amber"}>{status}</Pill>
      {outstanding > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <Input
            type="number"
            min="0"
            className="bg-panel2 h-9 w-32"
            placeholder="Amount"
            aria-label={`Payment received from ${label}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button size="sm" onClick={() => pay.mutate()} disabled={pay.isPending || !amount}>Record</Button>
          {canManage && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const { updateRow } = await import("@/lib/workforce-queries");
                await updateRow("collections", row.id, { status: "Written Off", updated_at: new Date().toISOString() });
                onChanged();
              }}
            >
              Write off
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
