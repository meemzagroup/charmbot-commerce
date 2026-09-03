import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { fetchProducts, createProduct, updateProduct, deleteProduct, isLowStock, type Product } from "@/lib/crm-queries";
import { fetchMyAccess } from "@/lib/comms-queries";
import { currency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Product & Inventory Catalog · Meemza CRM" },
      { name: "description", content: "Manage live tenant products, pricing and stock levels." },
      { property: "og:title", content: "Product & Inventory Catalog · Meemza CRM" },
      { property: "og:description", content: "Live product catalog and inventory management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductsPage,
});

type ProductForm = {
  title: string;
  sku: string;
  category: string;
  price: string;
  stock_quantity: string;
  low_stock_threshold: string;
};

const EMPTY_FORM: ProductForm = {
  title: "",
  sku: "",
  category: "",
  price: "",
  stock_quantity: "0",
  low_stock_threshold: "10",
};

function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: fetchProducts });
  const { data: access } = useQuery({ queryKey: ["my-access"], queryFn: fetchMyAccess });
  const isSuperAdmin = Boolean(access?.isSuperAdmin);

  const save = useMutation({
    mutationFn: async () => {
      const title = form.title.trim();
      const price = Number(form.price);
      const stock = Number(form.stock_quantity);
      const threshold = Number(form.low_stock_threshold);
      if (!title) throw new Error("Product name is required");
      if (!Number.isFinite(price) || price < 0) throw new Error("Enter a valid price");
      if (!Number.isInteger(stock) || stock < 0) throw new Error("Stock must be a whole number");
      if (!Number.isInteger(threshold) || threshold < 0) throw new Error("Threshold must be a whole number");
      const input = {
        title,
        sku: form.sku.trim() || null,
        category: form.category.trim() || null,
        price,
        stock_quantity: stock,
        low_stock_threshold: threshold,
      };
      if (editing) await updateProduct(editing.id, input);
      else await createProduct(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setEditing(null);
      setDialogOpen(false);
      toast.success("Product saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) =>
      (!lowOnly || isLowStock(p)) &&
      (!q || p.title.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q)),
    );
  }, [products, search, lowOnly]);

  const lowCount = products.filter(isLowStock).length;
  const stockValue = products.reduce((sum, p) => sum + Number(p.price) * p.stock_quantity, 0);

  function openCreate() {
    setForm({ ...EMPTY_FORM });
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setDialogOpen(true);
    setForm({
      title: product.title,
      sku: product.sku ?? "",
      category: product.category ?? "",
      price: String(product.price),
      stock_quantity: String(product.stock_quantity),
      low_stock_threshold: String(product.low_stock_threshold),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-title text-3xl">Product &amp; Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">{products.length} SKUs · stock value {currency(stockValue)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU, title, category…" className="w-full sm:w-72 bg-panel2" />
          <Button variant={lowOnly ? "default" : "outline"} onClick={() => setLowOnly((value) => !value)}>
            <AlertTriangle className="size-4" /> Low stock ({lowCount})
          </Button>
          {isSuperAdmin && <Button onClick={openCreate}><Plus className="size-4" /> Add Product</Button>}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-panel p-12 text-center">
          <p className="text-sm text-muted-foreground">{products.length === 0 ? "No products added yet." : "No products match this filter."}</p>
          {products.length === 0 && isSuperAdmin && <Button className="mt-4" onClick={openCreate}><Plus className="size-4" /> Add Product</Button>}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const low = isLowStock(p);
            return (
              <div key={p.id} className="rounded-lg bg-panel border border-line p-5 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="eyebrow">{p.category ?? "Uncategorised"}</div>
                    <h2 className="text-base font-medium mt-1 truncate">{p.title}</h2>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.sku ?? "No SKU"}</div>
                  </div>
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0", low ? "bg-danger/15 text-danger" : "bg-teal/10 text-teal")}>{low ? "LOW" : "IN STOCK"}</span>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div><div className="eyebrow">Price</div><div className="display-title text-2xl">{currency(Number(p.price))}</div></div>
                  <div className="text-right"><div className="eyebrow">On hand / threshold</div><div className={cn("display-title text-2xl", low && "text-danger")}>{p.stock_quantity} <span className="text-sm text-muted-foreground">/ {p.low_stock_threshold}</span></div></div>
                </div>
                {isSuperAdmin && <div className="mt-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => openEdit(p)}><Pencil className="size-4" /> Edit</Button><Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Delete ${p.title}?`)) remove.mutate(p.id); }}><Trash2 className="size-4 text-destructive" /></Button></div>}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="display-title text-2xl">{editing ? "Edit product" : "Add product"}</DialogTitle><DialogDescription>Save product details and live inventory for this company.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["title", "Product name / title", "e.g. Industrial defoamer"],
              ["sku", "SKU / code", "Optional code"],
              ["category", "Category", "e.g. Additives"],
              ["price", "Price", "0.00"],
              ["stock_quantity", "Initial stock / quantity on hand", "0"],
              ["low_stock_threshold", "Low-stock threshold", "10"],
            ] as const).map(([key, label, placeholder]) => (
              <div key={key} className="space-y-2"><Label htmlFor={`product-${key}`}>{label}</Label><Input id={`product-${key}`} type={key === "price" || key.includes("quantity") || key.includes("threshold") ? "number" : "text"} min="0" value={form[key]} placeholder={placeholder} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} className="bg-panel2" /></div>
            ))}
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : editing ? "Save changes" : "Create product"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
