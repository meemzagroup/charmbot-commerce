import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plus, QrCode, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { fetchSettings, saveSetting } from "@/lib/crm-queries";
import {
  createWhatsappChannel,
  deleteWhatsappChannel,
  fetchTeamMembers,
  fetchMyAccess,
  fetchWhatsappChannels,
  updateWhatsappChannel,
} from "@/lib/comms-queries";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@tanstack/react-start";
import {
  getWhatsappInstanceState,
  logoutWhatsappInstance,
} from "@/lib/evolution.functions";
import { UserManagementSection } from "@/components/crm/UserManagement";

export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_super_admin")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (!profile?.is_super_admin) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Settings & AI Configuration · Meemza CRM" },
      {
        name: "description",
        content:
          "Configure the Meemza support assistant: OpenAI or Gemini API keys, model choice and the system persona used for customer replies.",
      },
      { property: "og:title", content: "Settings & AI Configuration · Meemza CRM" },
      {
        property: "og:description",
        content: "AI assistant keys, model selection and persona configuration.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsGate,
});

function SettingsGate() {
  const { data: access, isLoading } = useQuery({ queryKey: ["my-access"], queryFn: fetchMyAccess });
  if (isLoading) return null;
  if (!access?.isSuperAdmin) {
    return (
      <div className="max-w-lg rounded-lg bg-panel border border-line p-8">
        <h1 className="display-title text-2xl">Restricted area</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Settings, integration credentials and user management are available to the Super Admin only.
        </p>
      </div>
    );
  }
  return <SettingsPage />;
}

const FIELDS = [
  { key: "openai_api_key", label: "OpenAI API key", placeholder: "sk-…", secret: true },
  { key: "gemini_api_key", label: "Gemini API key", placeholder: "AIza…", secret: true },
  { key: "ai_model", label: "Model", placeholder: "google/gemini-3.6-flash", secret: false },
  {
    key: "evolution_api_url",
    label: "Evolution API server URL",
    placeholder: "http://YOUR_SERVER_IP:8080",
    secret: false,
  },
  { key: "evolution_api_key", label: "Evolution API key", placeholder: "••••••", secret: true },
] as const;


function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings = [] } = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings.length) {
      setValues(Object.fromEntries(settings.map((s) => [s.key, s.value ?? ""])));
    }
  }, [settings]);

  async function save() {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(values).map(([key, value]) => saveSetting(key, value.trim())),
      );
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved", { description: "The assistant will use them immediately." });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const connected = Boolean(values['openai_api_key'] || values['gemini_api_key']);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="display-title text-3xl">Settings &amp; AI Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Keys are stored in the backend and used server-side only.
        </p>
      </div>

      <div className="rounded-lg bg-panel border border-line p-6 space-y-5">
        <div className="flex items-center gap-2 text-sm">
          <ShieldCheck className={connected ? "size-4 text-teal" : "size-4 text-brand"} />
          {connected
            ? "AI provider connected — live model replies enabled."
            : "No provider key yet — the assistant answers from the built-in rule engine."}
        </div>

        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-2">
            <Label htmlFor={f.key} className="flex items-center gap-2">
              <KeyRound className="size-3.5 text-muted-foreground" /> {f.label}
            </Label>
            <Input
              id={f.key}
              type={f.secret ? "password" : "text"}
              value={values[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="bg-panel2"
            />
          </div>
        ))}

        <div className="space-y-2">
          <Label htmlFor="assistant_persona">Assistant persona</Label>
          <Textarea
            id="assistant_persona"
            rows={4}
            value={values['assistant_persona'] ?? ""}
            placeholder="You are Meemza Chemicals' support agent…"
            onChange={(e) => setValues((v) => ({ ...v, assistant_persona: e.target.value }))}
            className="bg-panel2"
          />
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save configuration"}
        </Button>
      </div>

      <WhatsappChannelsSection />

      <UserManagementSection />
    </div>
  );
}

function WhatsappChannelsSection() {
  const queryClient = useQueryClient();
  const { data: channels = [] } = useQuery({
    queryKey: ["whatsapp-channels"],
    queryFn: fetchWhatsappChannels,
  });
  const { data: team = [] } = useQuery({ queryKey: ["team-members"], queryFn: fetchTeamMembers });

  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [memberId, setMemberId] = useState("");
  const [qrChannel, setQrChannel] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["whatsapp-channels"] });

  const add = useMutation({
    mutationFn: () => {
      if (!label.trim() || !phone.trim()) throw new Error("Department name and number required");
      return createWhatsappChannel({
        label: label.trim(),
        phone_number: phone.trim(),
        team_member_id: memberId || null,
      });
    },
    onSuccess: () => {
      setLabel("");
      setPhone("");
      setMemberId("");
      invalidate();
      toast.success("WhatsApp number connected");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: (p: { id: string; team_member_id?: string | null; is_active?: boolean }) =>
      updateWhatsappChannel(p.id, {
        ...(p.team_member_id !== undefined ? { team_member_id: p.team_member_id } : {}),
        ...(p.is_active !== undefined ? { is_active: p.is_active } : {}),
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Channel updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteWhatsappChannel(id),
    onSuccess: () => {
      invalidate();
      toast.success("Channel removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectClass = "h-9 rounded-md bg-panel2 border border-line px-2.5 text-xs text-foreground";

  return (
    <div className="rounded-lg bg-panel border border-line p-6 space-y-5">
      <div>
        <h2 className="display-title text-xl flex items-center gap-2">
          <Smartphone className="size-4 text-teal" /> WhatsApp Channels &amp; Employees
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect each employee or department WhatsApp number. Conversations can then be filtered by
          number in the Omnichannel Inbox.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] items-end">
        <div className="space-y-2">
          <Label htmlFor="wa_label">Department / employee name</Label>
          <Input
            id="wa_label"
            value={label}
            placeholder="Accounts"
            onChange={(e) => setLabel(e.target.value)}
            className="bg-panel2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wa_phone">WhatsApp number</Label>
          <Input
            id="wa_phone"
            value={phone}
            placeholder="+92 300 1234567"
            onChange={(e) => setPhone(e.target.value)}
            className="bg-panel2"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wa_member">Team member</Label>
          <select
            id="wa_member"
            className={`${selectClass} w-full`}
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            <option value="">Unlinked</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={() => add.mutate()} disabled={add.isPending}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      <div className="rounded-md border border-line divide-y divide-line/60">
        {channels.length === 0 && (
          <div className="px-4 py-8 text-sm text-muted-foreground text-center">
            No WhatsApp numbers connected yet.
          </div>
        )}
        {channels.map((c) => (
          <div key={c.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{c.label}</div>
              <div className="text-xs text-muted-foreground">{c.phone_number}</div>
            </div>
            <select
              className={`${selectClass} ml-auto`}
              value={c.team_member_id ?? ""}
              onChange={(e) => patch.mutate({ id: c.id, team_member_id: e.target.value || null })}
            >
              <option value="">Unlinked</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => patch.mutate({ id: c.id, is_active: !c.is_active })}
            >
              {c.is_active ? "Active" : "Paused"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setQrChannel(c.label)}>
              <QrCode className="size-4" /> Connect / Scan QR
            </Button>
            <Button variant="ghost" size="icon" onClick={() => remove.mutate(c.id)}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <QrConnectDialog instance={qrChannel} onClose={() => setQrChannel(null)} />
    </div>
  );
}

const STATUS_COPY: Record<string, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  disconnected: "Disconnected",
  unconfigured: "Not configured",
  error: "Disconnected",
};

function QrConnectDialog({ instance, onClose }: { instance: string | null; onClose: () => void }) {
  const getState = useServerFn(getWhatsappInstanceState);
  const logout = useServerFn(logoutWhatsappInstance);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["evolution-instance", instance],
    queryFn: () => getState({ data: { instance: instance as string } }),
    enabled: Boolean(instance),
    refetchInterval: (q) => (q.state.data?.status === "connecting" ? 5000 : false),
  });

  const status = data?.status ?? "connecting";
  const tone =
    status === "connected" ? "text-teal" : status === "connecting" ? "text-brand" : "text-destructive";

  return (
    <Dialog open={Boolean(instance)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="display-title">Connect {instance}</DialogTitle>
          <DialogDescription>
            Link this department number to its Evolution API instance. Instance name must match the
            department / employee name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className={`text-sm font-medium ${tone}`}>
            {isFetching && !data ? "Connecting…" : (STATUS_COPY[status] ?? "Disconnected")}
          </div>

          <div className="rounded-lg border border-line bg-panel2 aspect-square grid place-items-center overflow-hidden">
            {data?.qrBase64 ? (
              <img src={data.qrBase64} alt={`WhatsApp QR code for ${instance}`} className="size-full object-contain" />
            ) : (
              <div className="text-center px-6 space-y-2">
                <QrCode className="size-12 mx-auto text-muted-foreground" />
                <p className="text-xs text-muted-foreground break-words">
                  {data?.message ?? "Waiting for a QR code from the Evolution API server…"}
                </p>
              </div>
            )}
          </div>

          {data?.pairingCode && (
            <div className="text-xs text-muted-foreground">
              Pairing code: <span className="font-mono text-foreground">{data.pairingCode}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              Refresh
            </Button>
            {status === "connected" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await logout({ data: { instance: instance as string } });
                  refetch();
                }}
              >
                Disconnect
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

