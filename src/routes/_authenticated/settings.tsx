import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, ShieldCheck } from "lucide-react";
import { fetchSettings, saveSetting } from "@/lib/crm-queries";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/settings")({
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
  component: SettingsPage,
});

const FIELDS = [
  { key: "openai_api_key", label: "OpenAI API key", placeholder: "sk-…", secret: true },
  { key: "gemini_api_key", label: "Gemini API key", placeholder: "AIza…", secret: true },
  { key: "ai_model", label: "Model", placeholder: "google/gemini-3.6-flash", secret: false },
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

  const connected = Boolean(values.openai_api_key || values.gemini_api_key);

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
            value={values.assistant_persona ?? ""}
            placeholder="You are Meemza Chemicals' support agent…"
            onChange={(e) => setValues((v) => ({ ...v, assistant_persona: e.target.value }))}
            className="bg-panel2"
          />
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save configuration"}
        </Button>
      </div>
    </div>
  );
}
