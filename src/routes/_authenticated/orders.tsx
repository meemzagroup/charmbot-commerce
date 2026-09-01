import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchOrders, fetchOrderItems, type OrderWithCustomer } from "@/lib/crm-queries";
import { currency, shortDate } from "@/lib/format";
import { StatusPill } from "@/components/crm/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const ORDER_STATUSES = [
  "Pending",
  "Processing",
  "Shipped",
  "Delivered",
  "Cancelled",
  "Returned",
] as const;
const FILTERS = ["All", ...ORDER_STATUSES, "COD"] as const;

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "Orders & Fulfilment · Meemza CRM" },
      {
        name: "description",
        content:
          "Search, filter and fulfil Meemza Chemicals orders: update status, assign courier tracking and review invoice line items.",
      },
      { property: "og:title", content: "Orders & Fulfilment · Meemza CRM" },
      {
        property: "og:description",
        content: "Order fulfilment workspace with tracking, returns and invoice breakdowns.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OrderWithCustomer | null>(null);
  const [tracking, setTracking] = useState("");
  const [courier, setCourier] = useState("");

  const { data: orders = [], isLoading } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });

  const { data: items = [] } = useQuery({
    queryKey: ["order-items", selected?.id],
    queryFn: () => fetchOrderItems(selected!.id),
    enabled: !!selected,
  });

  const updateOrder = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<OrderWithCustomer> }) => {
      const { error } = await supabase.from("orders").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Order updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const matchFilter =
        filter === "All"
          ? true
          : filter === "COD"
            ? o.payment_status === "COD"
            : o.order_status === filter;
      const matchSearch =
        !q ||
        o.order_number.toLowerCase().includes(q) ||
        (o.customers?.full_name ?? "").toLowerCase().includes(q) ||
        (o.tracking_number ?? "").toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  }, [orders, filter, search]);

  function openOrder(order: OrderWithCustomer) {
    setSelected(order);
    setTracking(order.tracking_number ?? "");
    setCourier(order.courier_name ?? "");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-title text-3xl">Orders &amp; Fulfilment</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} of {orders.length} orders
          </p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search order #, customer, tracking…"
          className="w-full sm:w-80 bg-panel2"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded text-xs font-medium transition-colors",
              filter === f
                ? "bg-panel2 text-foreground border border-line"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="rounded-lg bg-panel border border-line overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left eyebrow">
                <th className="px-5 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {isLoading && (
                <tr>
                  <td className="px-5 py-6 text-muted-foreground" colSpan={7}>
                    Loading orders…
                  </td>
                </tr>
              )}
              {filtered.map((order) => (
                <tr key={order.id} className="hover:bg-panel2/60 transition-colors">
                  <td className="px-5 py-3 font-display font-semibold text-brand">
                    #{order.order_number}
                  </td>
                  <td className="px-4 py-3">{order.customers?.full_name ?? "Walk-in"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{shortDate(order.created_at)}</td>
                  <td className="px-4 py-3 text-right">{currency(Number(order.total_amount))}</td>
                  <td className="px-4 py-3">
                    <StatusPill value={order.payment_status} kind="payment" />
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={order.order_status}
                      onValueChange={(value) =>
                        updateOrder.mutate({ id: order.id, patch: { order_status: value } })
                      }
                    >
                      <SelectTrigger className="h-8 w-[140px] bg-panel2 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openOrder(order)}>
                      Invoice
                    </Button>
                  </td>
                </tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td className="px-5 py-6 text-muted-foreground" colSpan={7}>
                    No orders match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="display-title text-2xl">
              Invoice #{selected?.order_number}
            </DialogTitle>
            <DialogDescription>
              {selected?.customers?.full_name ?? "Walk-in"} · {shortDate(selected?.created_at)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-line divide-y divide-line/60">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span className="flex-1 truncate">{item.products?.title ?? "Item"}</span>
                  <span className="text-muted-foreground">×{item.quantity}</span>
                  <span className="w-28 text-right">
                    {currency(item.quantity * Number(item.unit_price))}
                  </span>
                </div>
              ))}
              <div className="flex items-center px-3 py-2.5 text-sm font-semibold">
                <span className="flex-1">Total</span>
                <span>{currency(Number(selected?.total_amount ?? 0))}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tracking">Tracking number</Label>
                <Input
                  id="tracking"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="TRK-0000"
                  className="bg-panel2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="courier">Courier</Label>
                <Input
                  id="courier"
                  value={courier}
                  onChange={(e) => setCourier(e.target.value)}
                  placeholder="TCS"
                  className="bg-panel2"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  if (!selected) return;
                  updateOrder.mutate({
                    id: selected.id,
                    patch: {
                      tracking_number: tracking || null,
                      courier_name: courier || null,
                      order_status: selected.order_status === "Pending" ? "Shipped" : selected.order_status,
                    },
                  });
                  setSelected(null);
                }}
              >
                Save fulfilment
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!selected) return;
                  updateOrder.mutate({
                    id: selected.id,
                    patch: { order_status: "Returned", payment_status: "Refunded" },
                  });
                  setSelected(null);
                }}
              >
                Process return
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
