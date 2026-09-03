import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  fetchOrders,
  fetchProducts,
  fetchInquiries,
  revenueByDay,
  revenueByMonth,
  type OrderWithCustomer,
  isLowStock,
} from "@/lib/crm-queries";
import { supabase } from "@/integrations/supabase/client";
import { currency, compactCurrency, relativeTime } from "@/lib/format";
import { StatusPill } from "@/components/crm/StatusPill";
import { cn } from "@/lib/utils";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Analytics Overview · Meemza CRM" },
      {
        name: "description",
        content:
          "Revenue, average order value, fulfilment status and top selling chemicals for Meemza Chemicals, live from the operations database.",
      },
      { property: "og:title", content: "Analytics Overview · Meemza CRM" },
      {
        property: "og:description",
        content: "Live e-commerce revenue, orders and support metrics for Meemza Chemicals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

function Kpi({
  label,
  value,
  delta,
  deltaTone,
  hint,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "teal" | "brand";
  hint: string;
}) {
  return (
    <div className="rounded-lg bg-panel border border-line p-5 flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <span className="eyebrow">{label}</span>
        {delta && <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", deltaTone === "teal" ? "text-teal bg-teal/10" : "text-brand bg-brand/10")}>{delta}</span>}
      </div>
      <div className="mt-3 display-title text-4xl">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function Overview() {
  const [range, setRange] = useState<"daily" | "monthly">("daily");
  const { data: orders = [] } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: fetchProducts });
  const { data: inquiries = [] } = useQuery({ queryKey: ["inquiries"], queryFn: fetchInquiries });
  const { data: topProducts = [] } = useQuery({
    queryKey: ["top-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("quantity, unit_price, products(title)");
      if (error) throw error;
      const totals = new Map<string, number>();
      for (const row of data ?? []) {
        const title = (row.products as { title: string } | null)?.title ?? "Unknown";
        totals.set(title, (totals.get(title) ?? 0) + row.quantity * Number(row.unit_price));
      }
      return [...totals.entries()]
        .map(([title, total]) => ({ title, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
    },
  });

  const stats = useMemo(() => {
    const valid = orders.filter(
      (o) => o.order_status !== "Cancelled" && o.payment_status !== "Refunded",
    );
    const revenue = valid.reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
    return {
      revenue,
      aov: valid.length ? revenue / valid.length : 0,
      totalOrders: orders.length,
      pending: orders.filter((o) => ["Pending", "Processing"].includes(o.order_status)).length,
      openInquiries: inquiries.filter((i) => ["Open", "In Progress"].includes(i.status)).length,
      botResolved: inquiries.filter((i) => i.status === "Resolved").length,
      lowStock: products.filter(isLowStock).length,
    };
  }, [orders, inquiries, products]);

  const chartData = range === "daily" ? revenueByDay(orders) : revenueByMonth(orders);
  const maxTop = Math.max(1, ...topProducts.map((p) => p.total));
  const recent: OrderWithCustomer[] = orders.slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="display-title text-3xl">Analytics Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live e-commerce performance across orders, fulfilment and support.
        </p>
      </div>

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Total Revenue"
          value={compactCurrency(stats.revenue)}
          hint="excludes cancelled & refunded"
        />
        <Kpi
          label="Avg Order Value"
          value={compactCurrency(stats.aov)}
          hint={`across ${stats.totalOrders} orders`}
        />
        <Kpi
          label="Total Orders"
          value={String(stats.totalOrders)}
          hint={`${stats.pending} pending fulfilment`}
        />
        <Kpi
          label="Open Inquiries"
          value={String(stats.openInquiries)}
          delta={`${stats.lowStock} low stock`}
          deltaTone="brand"
          hint={`${stats.botResolved} resolved by bot`}
        />
      </section>

      <section className="rounded-lg bg-panel border border-line p-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="display-title text-2xl">Revenue Trend</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {range === "daily" ? "Daily gross, trailing 14 days" : "Monthly gross, last 6 months"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {(["daily", "monthly"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "px-2.5 py-1 rounded capitalize transition-colors",
                  range === r ? "bg-panel2 text-foreground font-medium" : "text-muted-foreground",
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            {range === "daily" ? (
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-panel2)",
                    border: "1px solid var(--color-line)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => currency(v)}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="var(--color-brand)"
                  strokeWidth={2}
                  fill="url(#rev)"
                />
              </AreaChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-panel2)" }}
                  contentStyle={{
                    background: "var(--color-panel2)",
                    border: "1px solid var(--color-line)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => currency(v)}
                />
                <Bar dataKey="total" fill="var(--color-brand)" radius={[3, 3, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg bg-panel border border-line p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="display-title text-xl">Order Status</h2>
            <span className="text-xs text-muted-foreground">
              Updated {relativeTime(recent[0]?.created_at)}
            </span>
          </div>
          <div className="space-y-2.5">
            {recent.map((order) => (
              <div
                key={order.id}
                className="flex items-center gap-4 rounded-md bg-panel2 px-4 py-3"
              >
                <span className="font-display font-semibold text-sm w-20">#{order.order_number}</span>
                <span className="text-sm text-muted-foreground w-36 truncate">
                  {order.customers?.full_name ?? "Walk-in"}
                </span>
                <span className="ml-auto">
                  <StatusPill value={order.order_status} />
                </span>
                <span className="text-xs text-muted-foreground w-24 text-right truncate">
                  {order.tracking_number ?? order.payment_status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-panel border border-line p-6">
          <h2 className="display-title text-xl mb-5">Top Products</h2>
          <div className="space-y-4">
            {topProducts.map((p) => (
              <div key={p.title}>
                <div className="flex justify-between text-sm mb-1.5 gap-3">
                  <span className="truncate">{p.title}</span>
                  <span className="text-muted-foreground shrink-0">{compactCurrency(p.total)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-panel2">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.round((p.total / maxTop) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
