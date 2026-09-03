import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BadgeCheck,
  CalendarClock,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Send,
  Trash2,
} from "lucide-react";
import {
  campaignProgress,
  createCampaign,
  createTemplate,
  deleteCampaign,
  deleteTemplate,
  fetchCampaignLogs,
  fetchCampaigns,
  fetchTemplates,
  PLACEHOLDERS,
  renderTemplate,
  setCampaignStatus,
  TEMPLATE_CATEGORIES,
  updateTemplate,
  type CampaignWithTemplate,
  type WhatsappTemplate,
} from "@/lib/campaign-queries";
import { dispatchCampaignBatch, retryFailedMessages } from "@/lib/campaign.functions";
import { fetchCustomers, fetchMyCompany } from "@/lib/crm-queries";
import { fetchWhatsappChannels } from "@/lib/comms-queries";
import { relativeTime, shortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({
    meta: [
      { title: "WhatsApp Campaigns · Meemza CRM" },
      {
        name: "description",
        content:
          "Build, schedule and monitor bulk WhatsApp campaigns with anti-ban throttling, templates and delivery logs.",
      },
      { property: "og:title", content: "WhatsApp Campaigns · Meemza CRM" },
      {
        property: "og:description",
        content: "Bulk WhatsApp campaign engine with templates, scheduling and delivery tracking.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CampaignsPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-panel2 text-muted-foreground",
  sent: "bg-brand/15 text-brand",
  delivered: "bg-teal/15 text-teal",
  read: "bg-teal/25 text-teal",
  failed: "bg-destructive/15 text-destructive",
  opted_out: "bg-panel2 text-muted-foreground line-through",
  draft: "bg-panel2 text-muted-foreground",
  scheduled: "bg-brand/15 text-brand",
  in_progress: "bg-teal/15 text-teal",
  completed: "bg-teal/20 text-teal",
  paused: "bg-panel2 text-foreground",
};

function Pill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide",
        STATUS_STYLES[status] ?? "bg-panel2 text-muted-foreground",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">Outbound</div>
        <h1 className="display-title text-3xl mt-1">WhatsApp Campaigns</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bulk messaging with anti-ban throttling, personalisation and delivery tracking.
        </p>
      </div>

      <Tabs defaultValue="builder">
        <TabsList>
          <TabsTrigger value="builder">Campaign Builder</TabsTrigger>
          <TabsTrigger value="monitor">Monitor</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>
        <TabsContent value="builder" className="mt-6">
          <Builder />
        </TabsContent>
        <TabsContent value="monitor" className="mt-6">
          <Monitor />
        </TabsContent>
        <TabsContent value="templates" className="mt-6">
          <TemplateManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

function Builder() {
  const queryClient = useQueryClient();
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: templates = [] } = useQuery({ queryKey: ["wa-templates"], queryFn: fetchTemplates });
  const { data: channels = [] } = useQuery({
    queryKey: ["whatsapp-channels"],
    queryFn: fetchWhatsappChannels,
  });
  const { data: company } = useQuery({ queryKey: ["my-company"], queryFn: fetchMyCompany });

  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [instance, setInstance] = useState("");
  const [tag, setTag] = useState("All");
  const [selected, setSelected] = useState<string[]>([]);
  const [schedule, setSchedule] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");

  const tags = useMemo(
    () => ["All", ...Array.from(new Set(customers.map((c) => c.customer_tag).filter(Boolean)))],
    [customers],
  );

  const eligible = useMemo(
    () =>
      customers.filter(
        (c) =>
          !c.whatsapp_opted_out &&
          (c.phone ?? "").replace(/\D/g, "").length >= 8 &&
          (tag === "All" || c.customer_tag === tag),
      ),
    [customers, tag],
  );

  const template = templates.find((t) => t.id === templateId) ?? null;
  const previewCustomer = eligible.find((c) => selected.includes(c.id)) ?? eligible[0] ?? null;
  const preview = template
    ? renderTemplate(template.content, {
        name: previewCustomer?.full_name ?? "Ayesha Khan",
        phone: previewCustomer?.phone ?? "+92 300 0000000",
        company: company?.name ?? "Your company",
      })
    : "";

  const optedOutCount = customers.filter((c) => c.whatsapp_opted_out).length;

  const launch = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Give the campaign a title");
      if (!template) throw new Error("Select a message template");
      if (!instance.trim()) throw new Error("Select a WhatsApp sending number");
      const recipients = eligible.filter((c) => selected.includes(c.id));
      if (!recipients.length) throw new Error("Select at least one recipient");
      if (schedule === "later" && !scheduledAt) throw new Error("Pick a schedule date and time");
      return createCampaign({
        title: title.trim(),
        templateId: template.id,
        templateContent: template.content,
        instanceName: instance.trim(),
        scheduledAt: schedule === "later" ? new Date(scheduledAt).toISOString() : null,
        companyName: company?.name ?? null,
        recipients: recipients.map((r) => ({
          id: r.id,
          full_name: r.full_name,
          phone: r.phone,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-campaigns"] });
      setTitle("");
      setSelected([]);
      toast.success(
        schedule === "later" ? "Campaign scheduled" : "Campaign queued — open Monitor to dispatch",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allSelected = eligible.length > 0 && selected.length === eligible.length;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="rounded-lg border border-line bg-panel p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg">Recipients</h2>
          <div className="text-xs text-muted-foreground">
            {selected.length} selected · {optedOutCount} opted out (excluded)
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              aria-label={`Filter by ${t}`}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs border transition-colors",
                tag === t
                  ? "border-brand text-brand bg-brand/10"
                  : "border-line text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelected(allSelected ? [] : eligible.map((c) => c.id))}
            className="ml-auto text-xs text-brand hover:underline"
          >
            {allSelected ? "Clear selection" : "Select all in view"}
          </button>
        </div>

        <div className="max-h-[420px] overflow-auto divide-y divide-line rounded-md border border-line">
          {eligible.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No opted-in customers with a valid phone number in this segment.
            </div>
          ) : (
            eligible.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-3 px-4 py-3 text-sm cursor-pointer hover:bg-panel2/50"
              >
                <Checkbox
                  checked={selected.includes(c.id)}
                  onCheckedChange={(v) =>
                    setSelected((prev) =>
                      v ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                    )
                  }
                  aria-label={`Select ${c.full_name}`}
                />
                <span className="font-medium">{c.full_name}</span>
                <span className="text-muted-foreground">{c.phone}</span>
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                  {c.customer_tag}
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-panel p-5 space-y-4 h-fit">
        <h2 className="font-display text-lg">Campaign setup</h2>

        <div className="space-y-1.5">
          <Label htmlFor="campaign-title">Campaign title</Label>
          <Input
            id="campaign-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ramadan promo blast"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="campaign-template">Template</Label>
          <select
            id="campaign-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full h-10 rounded-md bg-panel2 border border-line px-3 text-sm"
          >
            <option value="">Select a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.category})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="campaign-instance">Sending number (instance)</Label>
          <select
            id="campaign-instance"
            value={instance}
            onChange={(e) => setInstance(e.target.value)}
            className="w-full h-10 rounded-md bg-panel2 border border-line px-3 text-sm"
          >
            <option value="">Select a connected channel…</option>
            {channels.map((c) => (
              <option key={c.id} value={c.label}>
                {c.label} · {c.phone_number}
              </option>
            ))}
          </select>
        </div>

        {template && (
          <div className="rounded-md border border-line bg-panel2 p-3">
            <div className="eyebrow mb-2">Live preview</div>
            <p className="text-sm whitespace-pre-wrap">{preview}</p>
          </div>
        )}

        <div className="space-y-2">
          <Label>Delivery</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSchedule("now")}
              className={cn(
                "flex-1 h-10 rounded-md border text-sm",
                schedule === "now" ? "border-brand text-brand bg-brand/10" : "border-line",
              )}
            >
              Send now
            </button>
            <button
              type="button"
              onClick={() => setSchedule("later")}
              className={cn(
                "flex-1 h-10 rounded-md border text-sm",
                schedule === "later" ? "border-brand text-brand bg-brand/10" : "border-line",
              )}
            >
              Schedule
            </button>
          </div>
          {schedule === "later" && (
            <Input
              type="datetime-local"
              aria-label="Schedule date and time"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          )}
          <p className="text-[11px] text-muted-foreground">
            Messages are throttled with a randomized 8–20 second gap to protect the number.
          </p>
        </div>

        <Button className="w-full" onClick={() => launch.mutate()} disabled={launch.isPending}>
          {schedule === "later" ? (
            <CalendarClock className="size-4" />
          ) : (
            <Send className="size-4" />
          )}
          {launch.isPending ? "Creating…" : "Create campaign"}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Monitor                                                             */
/* ------------------------------------------------------------------ */

function Monitor() {
  const queryClient = useQueryClient();
  const { data: campaigns = [] } = useQuery({
    queryKey: ["wa-campaigns"],
    queryFn: fetchCampaigns,
    refetchInterval: 5000,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = campaigns.find((c) => c.id === activeId) ?? campaigns[0] ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="rounded-lg border border-line bg-panel divide-y divide-line max-h-[560px] overflow-auto">
        {campaigns.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No campaigns yet. Create one in the builder.
          </div>
        ) : (
          campaigns.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(c.id)}
              className={cn(
                "w-full text-left px-4 py-3 hover:bg-panel2/60",
                active?.id === c.id && "bg-panel2",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{c.title}</span>
                <span className="ml-auto">
                  <Pill status={c.status} />
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {c.sent_count}/{c.total_contacts} sent · {shortDate(c.created_at)}
              </div>
            </button>
          ))
        )}
      </div>

      {active ? (
        <CampaignDetail campaign={active} onChanged={() => queryClient.invalidateQueries()} />
      ) : (
        <div className="rounded-lg border border-line bg-panel p-10 text-center text-sm text-muted-foreground">
          Select a campaign to view its progress.
        </div>
      )}
    </div>
  );
}

function CampaignDetail({
  campaign,
  onChanged,
}: {
  campaign: CampaignWithTemplate;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const dispatch = useServerFn(dispatchCampaignBatch);
  const retry = useServerFn(retryFailedMessages);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);

  const { data: logs = [] } = useQuery({
    queryKey: ["wa-campaign-logs", campaign.id],
    queryFn: () => fetchCampaignLogs(campaign.id),
    refetchInterval: 4000,
  });
  const p = campaignProgress(logs);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;

  // Drive the throttled dispatch loop while the campaign is running.
  useEffect(() => {
    if (campaign.status !== "in_progress") return;
    if (running.current) return;
    let cancelled = false;
    running.current = true;
    (async () => {
      try {
        for (;;) {
          if (cancelled) break;
          const res = await dispatch({ data: { campaignId: campaign.id, batchSize: 3 } });
          queryClient.invalidateQueries({ queryKey: ["wa-campaign-logs", campaign.id] });
          queryClient.invalidateQueries({ queryKey: ["wa-campaigns"] });
          if (res.status !== "in_progress" || res.remaining === 0 || res.processed === 0) break;
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Dispatch failed");
      } finally {
        running.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaign.status, campaign.id, dispatch, queryClient]);

  async function control(status: string) {
    setBusy(true);
    try {
      await setCampaignStatus(campaign.id, status);
      onChanged();
      toast.success(status === "paused" ? "Campaign paused" : "Campaign resumed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update campaign");
    } finally {
      setBusy(false);
    }
  }

  const stats = [
    { label: "Sent", value: p.sent },
    { label: "Delivered", value: p.delivered },
    { label: "Read", value: p.read },
    { label: "Failed", value: p.failed },
    { label: "Opted out", value: p.optedOut },
    { label: "Pending", value: p.pending },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-line bg-panel p-5 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Megaphone className="size-5 text-brand" />
          <h2 className="font-display text-lg">{campaign.title}</h2>
          <Pill status={campaign.status} />
          <div className="ml-auto flex gap-2">
            {campaign.status === "in_progress" ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => control("paused")}>
                <Pause className="size-4" /> Pause
              </Button>
            ) : campaign.status !== "completed" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => control("in_progress")}
              >
                <Play className="size-4" /> Resume
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={busy || p.failed === 0}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await retry({ data: { campaignId: campaign.id } });
                  toast.success(
                    `${res.requeued} message(s) re-queued${res.exhausted ? `, ${res.exhausted} exhausted ${res.maxRetries} retries` : ""}`,
                  );
                  onChanged();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Retry failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCcw className="size-4" /> Retry all failed
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await deleteCampaign(campaign.id);
                onChanged();
                toast.success("Campaign deleted");
              }}
              aria-label="Delete campaign"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        <div>
          <Progress value={pct} />
          <div className="text-xs text-muted-foreground mt-2">
            {p.done} of {p.total} processed ({pct}%)
            {campaign.scheduled_at ? ` · scheduled ${shortDate(campaign.scheduled_at)}` : ""}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-md border border-line bg-panel2 p-3">
              <div className="eyebrow">{s.label}</div>
              <div className="text-xl font-display mt-1">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-panel">
        <div className="px-5 py-3 border-b border-line flex items-center gap-2">
          <BadgeCheck className="size-4 text-teal" />
          <h3 className="font-display">Log & audit</h3>
        </div>
        <div className="max-h-[420px] overflow-auto divide-y divide-line">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No log entries yet.</div>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="px-5 py-3 text-sm flex items-start gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{l.phone_number}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[520px]">
                    {l.rendered_message}
                  </div>
                  {l.error_reason && (
                    <div className="text-xs text-destructive mt-1">{l.error_reason}</div>
                  )}
                </div>
                <div className="ml-auto text-right space-y-1">
                  <Pill status={l.status} />
                  <div className="text-[11px] text-muted-foreground">
                    {relativeTime(l.updated_at)}
                    {l.retry_count ? ` · retry ${l.retry_count}` : ""}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Template manager                                                    */
/* ------------------------------------------------------------------ */

type TemplateForm = { name: string; content: string; category: string };
const EMPTY_TEMPLATE: TemplateForm = { name: "", content: "", category: "marketing" };

function TemplateManager() {
  const queryClient = useQueryClient();
  const { data: templates = [] } = useQuery({ queryKey: ["wa-templates"], queryFn: fetchTemplates });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WhatsappTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>({ ...EMPTY_TEMPLATE });
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Template name is required");
      if (!form.content.trim()) throw new Error("Message content is required");
      const input = {
        name: form.name.trim(),
        content: form.content.trim(),
        category: form.category,
      };
      if (editing) await updateTemplate(editing.id, input);
      else await createTemplate(input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-templates"] });
      setOpen(false);
      setEditing(null);
      toast.success("Template saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wa-templates"] });
      toast.success("Template deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h2 className="font-display text-lg">Message templates</h2>
        <Button
          className="ml-auto"
          size="sm"
          onClick={() => {
            setEditing(null);
            setForm({ ...EMPTY_TEMPLATE });
            setOpen(true);
          }}
        >
          <Plus className="size-4" /> New template
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.length === 0 ? (
          <div className="rounded-lg border border-line bg-panel p-8 text-sm text-muted-foreground">
            No templates yet.
          </div>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="rounded-lg border border-line bg-panel p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.name}</span>
                <span className="ml-auto">
                  <Pill status={t.category} />
                </span>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.content}</p>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Edit ${t.name}`}
                  onClick={() => {
                    setEditing(t);
                    setForm({ name: t.name, content: t.content, category: t.category });
                    setOpen(true);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Delete ${t.name}`}
                  onClick={() => remove.mutate(t.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
            <DialogDescription>
              Use placeholders to personalise each message per recipient.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="template-name">Name</Label>
              <Input
                id="template-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-category">Category</Label>
              <select
                id="template-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full h-10 rounded-md bg-panel2 border border-line px-3 text-sm"
              >
                {TEMPLATE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="template-content">Message</Label>
              <Textarea
                id="template-content"
                ref={contentRef}
                rows={5}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              />
              <div className="flex gap-2 pt-1">
                {PLACEHOLDERS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, content: `${f.content}${v}` }))}
                    className="text-[11px] px-2 py-1 rounded border border-line text-muted-foreground hover:text-brand hover:border-brand"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
              Save template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
