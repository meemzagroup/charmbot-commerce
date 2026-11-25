import { useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// TEMPORARY: owner-only media backup. Server re-checks Platform Owner.
export function MediaBackupButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  async function run() {
    setBusy(true); setMsg("Preparing backup…"); setUrl(null);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/owner-media-backup", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      if (!res.ok) throw new Error(`Backup failed (${res.status})`);
      const blob = await res.blob();
      setUrl(URL.createObjectURL(blob));
      setMsg(`Ready: ${res.headers.get("X-Backup-File-Count") ?? "?"} files, ${(blob.size / 1048576).toFixed(1)} MB`);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy} className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm disabled:opacity-50">
        <Download className="size-4" /> {busy ? "Preparing…" : "Export media backup"}
      </button>
      {url && <a href={url} download="whatsapp-media-backup.zip" className="rounded-md bg-brand/15 text-brand px-3 py-2 text-sm font-medium">Download ZIP</a>}
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
