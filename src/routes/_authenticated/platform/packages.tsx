import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Plus } from "lucide-react";
import {
  CRM_MODULES,
  duplicatePackage,
  listPackages,
  savePackage,
  type PackageInput,
} from "@/lib/platform.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/platform/packages")({
  head: () => ({
    meta: [
      { title: "Subscription Packages · Manuta CRM" },
      { name: "description", content: "Create and configure subscription packages, limits and module access." },
      { property: "og:title", content: "Subscription Packages · Manuta CRM" },
      { property: "og:description", content: "Package pricing, limits and feature control." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PackagesPage,
});

const EMPTY: PackageInput = {
  name: "",
  description: "",
  monthly_price: 0,
  annual_price: 0,
  currency: "PKR",
  trial_days: 0,
  api_access: false,
  support_level: "Standard",
  modules: {},
  is_active: true,
};

const NUM_FIELDS: { key: keyof PackageInput; label: string }[] = [
  { key: "max_users", label: "Max users" },
  { key: "max_whatsapp_channels", label: "Max WhatsApp channels" },
  { key: "max_branches", label: "Max branches" },
  { key: "max_customers", label: "Customer limit" },
  { key: "max_orders", label: "Order limit" },
  { key: "max_campaigns_per_month", label: "Campaigns / month" },
  { key: "storage_mb", label: "Storage (MB)" },
  { key: "ai_message_limit", label: "AI usage limit" },
];

function PackagesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPackages);
  const saveFn = useServerFn(savePackage);
  const dupFn = useServerFn(duplicatePackage);
  const { data = [], error } = useQuery({ queryKey: ["packages"], queryFn: () => listFn({}) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PackageInput>(EMPTY);

  const save = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: () => {
      toast.success("Package saved");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["packages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dup = useMutation({
    mutationFn: (packageId: string) => dupFn({ data: { packageId } }),
    onSuccess: () => {
      toast.success("Package duplicated");
      void qc.invalidateQueries({ queryKey: ["packages"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function edit(pkg: any) {
    setForm({ ...pkg, modules: pkg.modules ?? {} });
    setOpen(true);
  }

  if (error) return <p className="text-sm text-red-400">{(error as Error).message}</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="display-title text-2xl">Subscription Packages</h1>
        <Button
          className="ml-auto"
          onClick={() => {
            setForm(EMPTY);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> New package
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.map((p: any) => (
          <div key={p.id} className="rounded-lg border border-line bg-panel p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{p.name}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${p.is_active ? "bg-teal/15 text-teal" : "bg-muted text-muted-foreground"}`}
              >
                {p.is_archived ? "Archived" : p.is_active ? "Active" : "Inactive"}
              </span>
              <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => edit(p)} aria-label={`Edit ${p.name}`}>
                <Pencil className="size-4" />
              </button>
              <button className="text-muted-foreground hover:text-foreground" onClick={() => dup.mutate(p.id)} aria-label={`Duplicate ${p.name}`}>
                <Copy className="size-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">{p.description}</p>
            <div className="text-sm">
              {p.currency} {p.monthly_price}/mo · {p.currency} {p.annual_price}/yr
            </div>
            <div className="text-xs text-muted-foreground">
              Users {p.max_users ?? "∞"} · Channels {p.max_whatsapp_channels ?? "∞"} · Trial {p.trial_days}d ·{" "}
              {p.support_level}
            </div>
            <div className="text-xs text-muted-foreground">
              Modules on: {Object.values(p.modules ?? {}).filter(Boolean).length} / {CRM_MODULES.length}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit package" : "New package"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Package name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Textarea
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Monthly price</Label>
              <Input
                type="number"
                value={form.monthly_price ?? 0}
                onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Annual price</Label>
              <Input
                type="number"
                value={form.annual_price ?? 0}
                onChange={(e) => setForm({ ...form, annual_price: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Currency</Label>
              <Input
                value={form.currency ?? "PKR"}
                onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label>Trial days</Label>
              <Input
                type="number"
                value={form.trial_days ?? 0}
                onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) })}
              />
            </div>
            {NUM_FIELDS.map((f) => (
              <div key={String(f.key)}>
                <Label>{f.label} (blank = unlimited)</Label>
                <Input
                  type="number"
                  value={(form[f.key] as number | null) ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, [f.key]: e.target.value === "" ? null : Number(e.target.value) })
                  }
                />
              </div>
            ))}
            <div>
              <Label>Support level</Label>
              <Input
                value={form.support_level ?? ""}
                onChange={(e) => setForm({ ...form, support_level: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-6 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={Boolean(form.api_access)}
                  onCheckedChange={(v) => setForm({ ...form, api_access: v })}
                />
                API access
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.is_active !== false}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={Boolean(form.is_archived)}
                  onCheckedChange={(v) => setForm({ ...form, is_archived: v })}
                />
                Archived
              </label>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Modules included</h3>
            <div className="grid gap-2 sm:grid-cols-3">
              {CRM_MODULES.map((m) => (
                <label key={m.key} className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={(form.modules ?? {})[m.key] !== false}
                    onCheckedChange={(v) =>
                      setForm({ ...form, modules: { ...(form.modules ?? {}), [m.key]: v } })
                    }
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save package
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
