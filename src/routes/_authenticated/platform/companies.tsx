import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Pencil, Plus, ShieldOff, ShieldCheck, Users } from "lucide-react";
import {
  listCompanies,
  listCompanyUsers,
  listPackages,
  saveCompany,
  setCompanyStatus,
  type CompanyInput,
  type CompanyRow,
} from "@/lib/platform.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/platform/companies")({
  head: () => ({
    meta: [
      { title: "Companies · Manuta CRM Platform" },
      { name: "description", content: "Create, configure and manage every tenant company on Manuta CRM." },
      { property: "og:title", content: "Companies · Manuta CRM Platform" },
      { property: "og:description", content: "Tenant company management with subscriptions and usage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompaniesPage,
});

const EMPTY: CompanyInput = {
  name: "",
  legal_name: "",
  company_code: "",
  email: "",
  phone: "",
  whatsapp: "",
  address: "",
  city: "",
  state: "",
  country: "Pakistan",
  timezone: "Asia/Karachi",
  currency: "PKR",
  language: "en",
  tax_id: "",
  website: "",
  status: "Active",
  package_id: null,
  limit_overrides: {},
};

const TEXT_FIELDS: { key: keyof CompanyInput; label: string }[] = [
  { key: "name", label: "Company name" },
  { key: "legal_name", label: "Legal name" },
  { key: "company_code", label: "Company code" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "website", label: "Website" },
  { key: "tax_id", label: "Tax / VAT / NTN" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State / Province" },
  { key: "country", label: "Country" },
  { key: "timezone", label: "Timezone" },
  { key: "currency", label: "Default currency" },
  { key: "logo_url", label: "Logo URL" },
];

const OVERRIDES = [
  { key: "max_users", label: "Users" },
  { key: "max_whatsapp_channels", label: "WhatsApp channels" },
  { key: "max_customers", label: "Customers" },
  { key: "max_orders", label: "Orders" },
];

function toDateInput(v: string | null | undefined) {
  return v ? new Date(v).toISOString().slice(0, 10) : "";
}

function CompaniesPage() {
  const qc = useQueryClient();
  const companiesFn = useServerFn(listCompanies);
  const packagesFn = useServerFn(listPackages);
  const saveFn = useServerFn(saveCompany);
  const statusFn = useServerFn(setCompanyStatus);
  const usersFn = useServerFn(listCompanyUsers);

  const { data: companies = [], error } = useQuery({
    queryKey: ["platform-companies"],
    queryFn: () => companiesFn({}),
  });
  const { data: packages = [] } = useQuery({ queryKey: ["packages"], queryFn: () => packagesFn({}) });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CompanyInput>(EMPTY);
  const [detail, setDetail] = useState<CompanyRow | null>(null);

  const { data: companyUsers = [] } = useQuery({
    queryKey: ["company-users", detail?.id],
    queryFn: () => usersFn({ data: { companyId: detail!.id } }),
    enabled: Boolean(detail),
  });

  const save = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: () => {
      toast.success("Company saved");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["platform-companies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = useMutation({
    mutationFn: (v: { companyId: string; status: "Active" | "Suspended" | "Archived" }) =>
      statusFn({ data: v }),
    onSuccess: () => {
      toast.success("Company status updated");
      void qc.invalidateQueries({ queryKey: ["platform-companies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function edit(c: CompanyRow) {
    setForm({
      ...c,
      subscription_start: toDateInput(c.subscription_start),
      subscription_expiry: toDateInput(c.subscription_expiry),
      trial_ends_at: toDateInput(c.trial_ends_at),
      limit_overrides: c.limit_overrides ?? {},
    } as CompanyInput);
    setOpen(true);
  }

  if (error) return <p className="text-sm text-red-400">{(error as Error).message}</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="display-title text-2xl">Companies</h1>
        <Button
          className="ml-auto"
          onClick={() => {
            setForm(EMPTY);
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> Add company
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground border-b border-line">
            <tr>
              <th className="p-3">Company</th>
              <th className="p-3">Package</th>
              <th className="p-3">Subscription</th>
              <th className="p-3">Usage</th>
              <th className="p-3">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const expired = c.subscription_expiry
                ? new Date(c.subscription_expiry).getTime() < Date.now()
                : false;
              return (
                <tr key={c.id} className="border-b border-line/60">
                  <td className="p-3">
                    <button className="font-medium hover:text-brand" onClick={() => setDetail(c)}>
                      {c.name}
                    </button>
                    <div className="text-xs text-muted-foreground">
                      {c.company_code ?? "—"} · {c.city ?? ""} {c.country ?? ""} · {c.currency}
                    </div>
                  </td>
                  <td className="p-3">{c.package_name ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {toDateInput(c.subscription_start) || "—"} →{" "}
                    <span className={expired ? "text-red-400" : ""}>
                      {toDateInput(c.subscription_expiry) || "no expiry"}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {c.user_count} users · {c.channel_count} channels · {c.customer_count} customers ·{" "}
                    {c.order_count} orders
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        c.status === "Active" && !expired
                          ? "bg-teal/15 text-teal"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {c.is_archived ? "Archived" : expired ? "Expired" : c.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3 justify-end">
                      <button onClick={() => edit(c)} aria-label={`Edit ${c.name}`} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="size-4" />
                      </button>
                      {c.status === "Active" ? (
                        <button
                          onClick={() => status.mutate({ companyId: c.id, status: "Suspended" })}
                          aria-label={`Suspend ${c.name}`}
                          className="text-muted-foreground hover:text-red-400"
                        >
                          <ShieldOff className="size-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => status.mutate({ companyId: c.id, status: "Active" })}
                          aria-label={`Reactivate ${c.name}`}
                          className="text-muted-foreground hover:text-teal"
                        >
                          <ShieldCheck className="size-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Editor */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit company" : "New company"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEXT_FIELDS.map((f) => (
              <div key={String(f.key)}>
                <Label>{f.label}</Label>
                <Input
                  value={(form[f.key] as string) ?? ""}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <Label>Language</Label>
              <select
                className="w-full h-10 rounded-md bg-panel2 border border-line px-3 text-sm"
                value={form.language ?? "en"}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="en">English</option>
                <option value="ur">اردو (Urdu)</option>
                <option value="ar">العربية (Arabic)</option>
              </select>
            </div>
            <div>
              <Label>Subscription package</Label>
              <select
                className="w-full h-10 rounded-md bg-panel2 border border-line px-3 text-sm"
                value={form.package_id ?? ""}
                onChange={(e) => setForm({ ...form, package_id: e.target.value || null })}
              >
                <option value="">— none —</option>
                {packages.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Status</Label>
              <select
                className="w-full h-10 rounded-md bg-panel2 border border-line px-3 text-sm"
                value={form.status ?? "Active"}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option>Active</option>
                <option>Suspended</option>
                <option>Archived</option>
              </select>
            </div>
            <div>
              <Label>Subscription start</Label>
              <Input
                type="date"
                value={form.subscription_start ?? ""}
                onChange={(e) => setForm({ ...form, subscription_start: e.target.value })}
              />
            </div>
            <div>
              <Label>Subscription expiry</Label>
              <Input
                type="date"
                value={form.subscription_expiry ?? ""}
                onChange={(e) => setForm({ ...form, subscription_expiry: e.target.value })}
              />
            </div>
            <div>
              <Label>Trial ends</Label>
              <Input
                type="date"
                value={form.trial_ends_at ?? ""}
                onChange={(e) => setForm({ ...form, trial_ends_at: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Package limit overrides (blank = use package)</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              {OVERRIDES.map((o) => (
                <div key={o.key}>
                  <Label>{o.label}</Label>
                  <Input
                    type="number"
                    value={(form.limit_overrides ?? {})[o.key] ?? ""}
                    onChange={(e) => {
                      const next = { ...(form.limit_overrides ?? {}) };
                      if (e.target.value === "") delete next[o.key];
                      else next[o.key] = Number(e.target.value);
                      setForm({ ...form, limit_overrides: next });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save company
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Company detail */}
      <Dialog open={Boolean(detail)} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="size-4 text-brand" /> {detail?.name}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                <div>Package: <span className="text-foreground">{detail.package_name ?? "—"}</span></div>
                <div>Status: <span className="text-foreground">{detail.status}</span></div>
                <div>Currency: <span className="text-foreground">{detail.currency}</span></div>
                <div>Language: <span className="text-foreground">{detail.language}</span></div>
                <div>Timezone: <span className="text-foreground">{detail.timezone}</span></div>
                <div>Created: <span className="text-foreground">{new Date(detail.created_at).toLocaleDateString()}</span></div>
                <div>WhatsApp channels used: <span className="text-foreground">{detail.channel_count}</span></div>
                <div>Records: <span className="text-foreground">{detail.customer_count} customers / {detail.order_count} orders</span></div>
              </div>
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <Users className="size-4" /> Company users ({companyUsers.length})
                </h3>
                <ul className="space-y-1">
                  {companyUsers.map((u: any) => (
                    <li key={u.id} className="flex justify-between text-muted-foreground">
                      <span className="text-foreground">{u.full_name || u.email}</span>
                      <span>{u.status}</span>
                    </li>
                  ))}
                  {companyUsers.length === 0 && <li className="text-muted-foreground">No users yet</li>}
                </ul>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
