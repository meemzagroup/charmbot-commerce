import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type EvolutionConfig = { baseUrl: string; apiKey: string };

async function readConfig(supabase: {
  from: (t: string) => {
    select: (c: string) => { in: (col: string, v: string[]) => Promise<{ data: unknown }> };
  };
}): Promise<EvolutionConfig | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["evolution_api_url", "evolution_api_key"]);
  const rows = (data ?? []) as { key: string; value: string | null }[];
  const map = Object.fromEntries(rows.map((r) => [r.key, (r.value ?? "").trim()]));
  const baseUrl = (map["evolution_api_url"] ?? "").replace(/\/+$/, "");
  const apiKey = map["evolution_api_key"] ?? "";
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}

export type InstanceState = {
  configured: boolean;
  status: "connecting" | "connected" | "disconnected" | "unconfigured" | "error";
  qrBase64: string | null;
  pairingCode: string | null;
  message: string | null;
};

export const getWhatsappInstanceState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string }) => {
    const instance = String(input?.instance ?? "").trim();
    if (!instance || instance.length > 120) throw new Error("Invalid instance name");
    return { instance };
  })
  .handler(async ({ data, context }): Promise<InstanceState> => {
    const cfg = await readConfig(context.supabase as never);
    if (!cfg) {
      return {
        configured: false,
        status: "unconfigured",
        qrBase64: null,
        pairingCode: null,
        message: "Add your Evolution API server URL and API key above to connect this number.",
      };
    }

    const headers = { apikey: cfg.apiKey, "Content-Type": "application/json" };
    const name = encodeURIComponent(data.instance);

    try {
      const stateRes = await fetch(`${cfg.baseUrl}/instance/connectionState/${name}`, { headers });
      const stateJson = (await stateRes.json().catch(() => null)) as
        | { instance?: { state?: string } }
        | null;
      const state = stateJson?.instance?.state ?? null;

      if (state === "open") {
        return {
          configured: true,
          status: "connected",
          qrBase64: null,
          pairingCode: null,
          message: "This number is connected and receiving messages.",
        };
      }

      const connectRes = await fetch(`${cfg.baseUrl}/instance/connect/${name}`, { headers });
      const connectJson = (await connectRes.json().catch(() => null)) as
        | { base64?: string; code?: string; pairingCode?: string; message?: string }
        | null;

      const qr = connectJson?.base64 ?? null;
      if (qr) {
        return {
          configured: true,
          status: "connecting",
          qrBase64: qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`,
          pairingCode: connectJson?.pairingCode ?? null,
          message: "Scan this QR code in WhatsApp → Linked devices.",
        };
      }

      return {
        configured: true,
        status: state ? "disconnected" : "error",
        qrBase64: null,
        pairingCode: connectJson?.pairingCode ?? null,
        message:
          connectJson?.message ??
          (state
            ? `Instance state: ${state}. Waiting for a QR code…`
            : `Instance "${data.instance}" was not found on the server. Create it in Evolution API first.`),
      };
    } catch {
      return {
        configured: true,
        status: "error",
        qrBase64: null,
        pairingCode: null,
        message: "Could not reach the Evolution API server. Check the URL and API key.",
      };
    }
  });

export const logoutWhatsappInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { instance: string }) => {
    const instance = String(input?.instance ?? "").trim();
    if (!instance || instance.length > 120) throw new Error("Invalid instance name");
    return { instance };
  })
  .handler(async ({ data, context }) => {
    const cfg = await readConfig(context.supabase as never);
    if (!cfg) throw new Error("Evolution API is not configured");
    const res = await fetch(
      `${cfg.baseUrl}/instance/logout/${encodeURIComponent(data.instance)}`,
      { method: "DELETE", headers: { apikey: cfg.apiKey } },
    );
    return { ok: res.ok };
  });
