import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProducts } from "@/lib/crm-queries";
import { currency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Product & Inventory Catalog · Meemza CRM" },
      {
        name: "description",
        content:
          "Manage Meemza Chemicals SKUs, pricing and stock levels with low-stock warnings and inline restocking.",
      },
      { property: "og:title", content: "Product & Inventory Catalog · Meemza CRM" },
      {
        property: "og:description",
        content: "Chemical SKU catalog with pricing, stock levels and low-stock alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: fetchProducts });

  const restock = useMutation({
    mutationFn: async ({ id, stock }: { id: string; stock: number }) => {
      const { error } = await supabase
        .from("products")
        .update({ stock_quantity: stock })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Inventory updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!lowOnly || p.stock_quantity <= 10) &&
        (!q ||
          p.title.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q)),
    );
  }, [products, search, lowOnly]);

  const lowCount = products.filter((p) => p.stock_quantity <= 10).length;
  const stockValue = products.reduce((s, p) => s + Number(p.price) * p.stock_quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-title text-3xl">Product &amp; Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {products.length} SKUs · stock value {currency(stockValue)}
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, title, category…"
            className="w-full sm:w-72 bg-panel2"
          />
          <Button variant={lowOnly ? "default" : "outline"} onClick={() => setLowOnly((v) => !v)}>
            <AlertTriangle className="size-4" /> Low stock ({lowCount})
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => {
          const low = p.stock_quantity <= 10;
          return (
            <div key={p.id} className="rounded-lg bg-panel border border-line p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="eyebrow">{p.category ?? "Uncategorised"}</div>
                  <h2 className="text-base font-medium mt-1 truncate">{p.title}</h2>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.sku ?? "No SKU"}</div>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0",
                    low ? "bg-danger/15 text-danger" : "bg-teal/10 text-teal",
                  )}
                >
                  {low ? "LOW" : "IN STOCK"}
                </span>
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <div className="eyebrow">Price</div>
                  <div className="display-title text-2xl">{currency(Number(p.price))}</div>
                </div>
                <div className="text-right">
                  <div className="eyebrow">On hand</div>
                  <div className={cn("display-title text-2xl", low && "text-danger")}>
                    {p.stock_quantity}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    restock.mutate({ id: p.id, stock: Math.max(0, p.stock_quantity - 10) })
                  }
                >
                  −10
                </Button>
                <Button
                  size="sm"
                  onClick={() => restock.mutate({ id: p.id, stock: p.stock_quantity + 50 })}
                >
                  Restock +50
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
