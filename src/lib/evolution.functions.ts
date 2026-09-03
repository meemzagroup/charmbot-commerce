import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type EvolutionConfig = { baseUrl: string; apiKey: string };

// Reads the Evolution credentials server-side. These are Super Admin-only
// secrets, so the caller is verified as the Super Admin before the service
// client is ever used to read the settings rows.
async function readConfig(context: {
  supabase: { from: (t: string) => any };
  userId: string;
}): Promise<EvolutionConfig | null> {
  const { data: profile, error } = await context.supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw new Error("Forbidden");
  if (!profile?.is_super_admin) throw new Error("Forbidden: Super Admin only");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");


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

    // Mutable so we can swap in an instance-scoped token when the server
    // exposes one via /instance/fetchInstances.
    const headers: Record<string, string> = {
      apikey: cfg.apiKey,
      "Content-Type": "application/json",
    };
    const name = encodeURIComponent(data.instance);

    // Diagnostics: confirm the stored key actually reaches the fetch call.
    console.log(
      `[evolution] base=${cfg.baseUrl} instance=${data.instance} apikey=${
        cfg.apiKey ? `present (${cfg.apiKey.length} chars)` : "KEY IS EMPTY"
      }`,
    );

    // Helpers kept inside the handler so this module stays client-safe.
    const normalizeQr = (raw: string | null | undefined): string | null => {
      if (!raw) return null;
      return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
    };

    // Our backend runs on Cloudflare's network, which refuses outbound calls to
    // bare IP addresses and answers with "error code: 1003" — that response never
    // reaches the Evolution server, so it is not an API-key problem.
    const isIpHost = /^https?:\/\/\d{1,3}(\.\d{1,3}){3}(:\d+)?/i.test(cfg.baseUrl);
    const hintFor = (body: string): string =>
      body.includes("error code: 1003") || (isIpHost && body.includes("1003"))
        ? ` — This response came from Cloudflare, not your Evolution server: our backend cannot call a raw IP address (${cfg.baseUrl}). Point a hostname at that server (e.g. a free DuckDNS/No-IP domain or your own subdomain, ideally with HTTPS) and save that URL in Settings instead of the IP.`
        : "";

    const describeStatus = (status: number): string => {
      const labels: Record<number, string> = {
        400: "Bad Request",
        401: "Unauthorized — the API key was rejected",
        403: "Forbidden",
        404: "Not Found",
        409: "Conflict — the instance may already exist",
        500: "Internal Server Error",
        502: "Bad Gateway",
        503: "Service Unavailable",
      };
      return `${status} ${labels[status] ?? res0StatusText(status)}`.trim();
    };
    const res0StatusText = (s: number): string => (s ? "Error" : "Network Error");


    // Some Evolution deployments reject the global key on instance-scoped
    // routes and require the per-instance token instead. Look it up once and
    // switch the apikey header when we find a match.
    const useInstanceToken = async (): Promise<void> => {
      try {
        const res = await fetch(`${cfg.baseUrl}/instance/fetchInstances`, {
          headers: { apikey: cfg.apiKey },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as unknown;
        const list = Array.isArray(json)
          ? json
          : Array.isArray((json as { instances?: unknown[] })?.instances)
            ? (json as { instances: unknown[] }).instances
            : [];
        for (const raw of list) {
          const entry = (raw ?? {}) as Record<string, any>;
          const inst = (entry["instance"] ?? entry) as Record<string, any>;
          const instName = inst?.["instanceName"] ?? inst?.["name"] ?? entry?.["name"];
          if (String(instName ?? "") !== data.instance) continue;
          const token =
            inst?.["token"] ??
            inst?.["apikey"] ??
            inst?.["hash"]?.["apikey"] ??
            (typeof inst?.["hash"] === "string" ? inst["hash"] : null) ??
            entry?.["token"] ??
            entry?.["apikey"];
          if (typeof token === "string" && token.trim()) {
            headers["apikey"] = token.trim();
          }
          return;
        }
      } catch {
        // Fall back to the global key.
      }
    };


    const fetchState = async (): Promise<{ status: number; state: string | null; error: string | null }> => {
      const res = await fetch(`${cfg.baseUrl}/instance/connectionState/${name}`, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      const rawBody = await res.text().catch(() => "");
      let json: { instance?: { state?: string } } | null = null;
      try {
        json = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        json = null;
      }
      const snippet = rawBody.replace(/\s+/g, " ").trim();
      return {
        status: res.status,
        state: json?.instance?.state ?? null,
        error: res.ok ? null : `${describeStatus(res.status)}${hintFor(snippet)}`,
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
          : `POST /instance/create failed — ${describeStatus(res.status)}${snippet ? `: ${snippet.slice(0, 300)}` : ""}${hintFor(snippet)}`,
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
      connected: boolean;
    }> => {
      const res = await fetch(`${cfg.baseUrl}/instance/connect/${name}`, {
        headers,
        signal: AbortSignal.timeout(20000),
      });
      const rawBody = await res.text().catch(() => "");
      let json: {
        base64?: string;
        code?: string;
        qrcode?: { base64?: string; pairingCode?: string; code?: string };
        pairingCode?: string;
        message?: string;
        instance?: { state?: string };
      } | null = null;
      try {
        json = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        json = null;
      }
      const snippet = rawBody.replace(/\s+/g, " ").trim();
      // Evolution v2 returns { base64, code } for QR, or { instance: { state: "open" } } when linked.
      const connected = json?.instance?.state === "open";
      return {
        status: res.status,
        error: res.ok
          ? null
          : `GET /instance/connect/${data.instance} failed — ${describeStatus(res.status)}${snippet ? `: ${snippet.slice(0, 300)}` : ""}${hintFor(snippet)}`,
        qrBase64: normalizeQr(json?.base64 ?? json?.qrcode?.base64),
        pairingCode: json?.pairingCode ?? json?.qrcode?.pairingCode ?? null,
        message: json?.message ?? null,
        connected,
      };
    };

    try {
      // 1. Check the current state with the GLOBAL apikey (Evolution v2 contract).
      //    Auto-create the instance when it's missing (404).
      let { status: stateStatus, state } = await fetchState();

      // Only if the global key is rejected (401/403) do we try an instance-scoped
      // token exposed via /instance/fetchInstances, then retry once.
      if (stateStatus === 401 || stateStatus === 403) {
        await useInstanceToken();
        ({ status: stateStatus, state } = await fetchState());
      }

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

      // 3. Not linked → request a fresh QR code from GET /instance/connect/{name}.
      let qr = await fetchQr();

      // Global key rejected on connect? Retry once with an instance-scoped token.
      if (qr.status === 401 || qr.status === 403) {
        await useInstanceToken();
        qr = await fetchQr();
      }

      // v2 may answer /instance/connect with { instance: { state: "open" } }.
      if (qr.connected) {
        return {
          configured: true,
          status: "connected",
          qrBase64: null,
          pairingCode: null,
          message: "This number is connected and receiving messages.",
        };
      }

      // Rare race: instance removed between state check and connect — create and retry once.
      if (qr.status === 404) {
        const created = await createInstance();
        if (created.ok) {
          qr = created.qrBase64
            ? { status: 200, error: null, qrBase64: created.qrBase64, pairingCode: created.pairingCode, message: null, connected: false }
            : await fetchQr();
        } else if (created.error) {
          return {
            configured: true,
            status: "error",
            qrBase64: null,
            pairingCode: null,
            message: created.error,
          };
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
          qr.error ??
          qr.message ??
          (state
            ? `Instance state: ${state}. Waiting for a QR code…`
            : `Instance "${data.instance}" was not found on the server and could not be created.`),
      };
    } catch (e) {
      const timedOut =
        e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      const detail = e instanceof Error ? ` [${e.name}: ${e.message}]` : "";
      return {
        configured: true,
        status: "error",
        qrBase64: null,
        pairingCode: null,
        message: timedOut
          ? `Network Error: the Evolution API server at ${cfg.baseUrl} did not respond (timed out). The request is made from our backend, not your browser — so the server is unreachable from the internet. Check that the port is open/forwarded and not blocked by a firewall.`
          : `Network Error: could not reach the Evolution API server at ${cfg.baseUrl}.${detail} Check the URL and API key.`,
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
