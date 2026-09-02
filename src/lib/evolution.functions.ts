import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type EvolutionConfig = { baseUrl: string; apiKey: string };

// Reads the Evolution credentials server-side. The caller must already be an
// authenticated staff member (verified below) — settings rows are admin-only
// under RLS, so we read them with the service client after that check.
async function readConfig(context: {
  supabase: { from: (t: string) => any };
  userId: string;
}): Promise<EvolutionConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (!roles || roles.length === 0) throw new Error("Forbidden");

  const { data } = await supabaseAdmin
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
    const cfg = await readConfig(context);
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

    // Helpers kept inside the handler so this module stays client-safe.
    const normalizeQr = (raw: string | null | undefined): string | null => {
      if (!raw) return null;
      return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
    };

    const describeStatus = (status: number): string => {
      const labels: Record<number, string> = {
        400: "Bad Request",
        401: "Unauthorized — the API key was rejected",
        403: "Forbidden — the API key lacks permission",
        404: "Not Found",
        409: "Conflict — the instance may already exist",
        500: "Internal Server Error",
        502: "Bad Gateway",
        503: "Service Unavailable",
      };
      return `${status} ${labels[status] ?? res0StatusText(status)}`.trim();
    };
    const res0StatusText = (s: number): string => (s ? "Error" : "Network Error");

    const fetchState = async (): Promise<{ status: number; state: string | null; error: string | null }> => {
      const res = await fetch(`${cfg.baseUrl}/instance/connectionState/${name}`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json().catch(() => null)) as
        | { instance?: { state?: string } }
        | null;
      return {
        status: res.status,
        state: json?.instance?.state ?? null,
        error: res.ok ? null : `${describeStatus(res.status)}`,
      };
    };

    const createInstance = async (): Promise<{
      ok: boolean;
      status: number;
      error: string | null;
      qrBase64: string | null;
      pairingCode: string | null;
    }> => {
      const res = await fetch(`${cfg.baseUrl}/instance/create`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          instanceName: data.instance,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const rawBody = await res.text().catch(() => "");
      let json: {
        qrcode?: { base64?: string; pairingCode?: string };
        base64?: string;
        pairingCode?: string;
      } | null = null;
      try {
        json = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        json = null;
      }
      const snippet = rawBody.replace(/\s+/g, " ").trim();
      return {
        ok: res.ok,
        status: res.status,
        error: res.ok
          ? null
          : `POST /instance/create failed — ${describeStatus(res.status)}${snippet ? `: ${snippet.slice(0, 300)}` : ""}`,
        qrBase64: normalizeQr(json?.qrcode?.base64 ?? json?.base64),
        pairingCode: json?.qrcode?.pairingCode ?? json?.pairingCode ?? null,
      };
    };

    const fetchQr = async (): Promise<{
      status: number;
      error: string | null;
      qrBase64: string | null;
      pairingCode: string | null;
      message: string | null;
    }> => {
      const res = await fetch(`${cfg.baseUrl}/instance/connect/${name}`, {
        headers,
        signal: AbortSignal.timeout(20000),
      });
      const rawBody = await res.text().catch(() => "");
      let json: {
        base64?: string;
        qrcode?: { base64?: string; pairingCode?: string };
        pairingCode?: string;
        message?: string;
      } | null = null;
      try {
        json = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        json = null;
      }
      const snippet = rawBody.replace(/\s+/g, " ").trim();
      return {
        status: res.status,
        error: res.ok
          ? null
          : `GET /instance/connect/${data.instance} failed — ${describeStatus(res.status)}${snippet ? `: ${snippet.slice(0, 300)}` : ""}`,
        qrBase64: normalizeQr(json?.base64 ?? json?.qrcode?.base64),
        pairingCode: json?.pairingCode ?? json?.qrcode?.pairingCode ?? null,
        message: json?.message ?? null,
      };
    };

    try {
      // 1. Check the current state; auto-create the instance when it's missing (404).
      let { status: stateStatus, state } = await fetchState();

      if (stateStatus === 404) {
        const created = await createInstance();
        if (!created.ok) {
          return {
            configured: true,
            status: "error",
            qrBase64: null,
            pairingCode: null,
            message:
              created.error ??
              `Instance "${data.instance}" was not found and could not be created on the server.`,
          };
        }
        // Some Evolution versions return the QR directly from /instance/create.
        if (created.qrBase64) {
          return {
            configured: true,
            status: "connecting",
            qrBase64: created.qrBase64,
            pairingCode: created.pairingCode,
            message: "Scan this QR code in WhatsApp → Linked devices.",
          };
        }
        // Otherwise fall through and fetch the QR via /instance/connect below.
        state = (await fetchState()).state;
      }

      // 2. Already linked → done.
      if (state === "open") {
        return {
          configured: true,
          status: "connected",
          qrBase64: null,
          pairingCode: null,
          message: "This number is connected and receiving messages.",
        };
      }

      // 3. Not linked → request a fresh QR code.
      let qr = await fetchQr();

      // Rare race: instance removed between state check and connect — create and retry once.
      if (qr.status === 404) {
        const created = await createInstance();
        if (created.ok) {
          qr = created.qrBase64
            ? { status: 200, qrBase64: created.qrBase64, pairingCode: created.pairingCode, message: null }
            : await fetchQr();
        }
      }

      if (qr.qrBase64) {
        return {
          configured: true,
          status: "connecting",
          qrBase64: qr.qrBase64,
          pairingCode: qr.pairingCode,
          message: "Scan this QR code in WhatsApp → Linked devices.",
        };
      }

      return {
        configured: true,
        status: state ? "disconnected" : "error",
        qrBase64: null,
        pairingCode: qr.pairingCode,
        message:
          qr.message ??
          (state
            ? `Instance state: ${state}. Waiting for a QR code…`
            : `Instance "${data.instance}" was not found on the server and could not be created.`),
      };
    } catch (e) {
      const timedOut =
        e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      return {
        configured: true,
        status: "error",
        qrBase64: null,
        pairingCode: null,
        message: timedOut
          ? `The Evolution API server at ${cfg.baseUrl} did not respond (timed out). The request is made from our backend, not your browser — so the server is unreachable from the internet. Check that the port is open/forwarded and not blocked by a firewall.`
          : "Could not reach the Evolution API server. Check the URL and API key.",
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
    const cfg = await readConfig(context);
    if (!cfg) throw new Error("Evolution API is not configured");
    const res = await fetch(
      `${cfg.baseUrl}/instance/logout/${encodeURIComponent(data.instance)}`,
      { method: "DELETE", headers: { apikey: cfg.apiKey }, signal: AbortSignal.timeout(15000) },
    );
    return { ok: res.ok };
  });
