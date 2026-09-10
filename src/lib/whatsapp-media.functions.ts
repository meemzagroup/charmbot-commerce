import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePublicHttpsUrl } from "@/lib/public-service-url";

/**
 * On-demand WhatsApp media retrieval.
 *
 * Evolution only stores media behind the original WhatsApp message key, and the
 * `mmg.whatsapp.net` URLs inside the payload are short-lived and encrypted. So
 * the first time a user opens a photo / voice note we ask Evolution to decrypt
 * it, cache the bytes in company-isolated private storage, and hand back a
 * short-lived signed URL. Later opens are served straight from the cache.
 */

export type MediaResult =
  | { ok: true; url: string; mimetype: string; filename: string }
  | { ok: false; reason: string };

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "oga",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

function extFor(mimetype: string, filename: string) {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(filename)?.[1];
  if (fromName) return fromName.toLowerCase();
  const base = mimetype.split(";")[0]?.trim() ?? "";
  return EXT[base] ?? "bin";
}

export const getWhatsappMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string }) => {
    const messageId = String(input?.messageId ?? "").trim();
    if (!messageId) throw new Error("Message is required");
    return { messageId };
  })
  .handler(async ({ data, context }): Promise<MediaResult> => {
    const { supabase } = context as { supabase: any };

    // RLS decides whether the caller may see this message at all.
    const { data: message } = await supabase
      .from("messages")
      .select("id, company_id, thread_id, metadata")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!message) return { ok: false, reason: "This message is not available to your account." };

    const meta = (message.metadata ?? {}) as Record<string, any>;
    const media = (meta["media"] ?? {}) as Record<string, any>;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sign = async (path: string) => {
      const signed = await supabaseAdmin.storage.from("whatsapp-media").createSignedUrl(path, 60 * 60);
      return signed.data?.signedUrl ?? null;
    };

    const cachedPath = typeof meta["media_path"] === "string" ? meta["media_path"] : null;
    if (cachedPath) {
      const url = await sign(cachedPath);
      if (url) {
        return {
          ok: true,
          url,
          mimetype: String(media["mimetype"] ?? "application/octet-stream"),
          filename: String(media["filename"] ?? cachedPath.split("/").pop()),
        };
      }
    }

    const providerId = typeof meta["message_id"] === "string" ? meta["message_id"] : null;
    if (!providerId) return { ok: false, reason: "Media unavailable from WhatsApp history" };

    // Resolve the Evolution instance for this message's channel.
    let instance = typeof meta["instance"] === "string" ? meta["instance"] : "";
    if (!instance && meta["whatsapp_channel_id"]) {
      const { data: channel } = await supabaseAdmin
        .from("whatsapp_channels")
        .select("instance_key")
        .eq("id", meta["whatsapp_channel_id"])
        .maybeSingle();
      instance = channel?.instance_key ?? "";
    }
    if (!instance) return { ok: false, reason: "Media unavailable from WhatsApp history" };

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("key, value")
      .in("key", ["evolution_api_url", "evolution_api_key"]);
    const map = Object.fromEntries((settings ?? []).map((r: any) => [r.key, (r.value ?? "").trim()]));
    const rawUrl = String(map["evolution_api_url"] ?? "").replace(/\/+$/, "");
    const apiKey = String(map["evolution_api_key"] ?? "");
    if (!rawUrl || !apiKey) return { ok: false, reason: "WhatsApp is not configured by the platform owner" };
    const baseUrl = requirePublicHttpsUrl(rawUrl, "WhatsApp");

    let payload: any = null;
    try {
      const res = await fetch(
        `${baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`,
        {
          method: "POST",
          headers: { apikey: apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ message: { key: { id: providerId } }, convertToMp4: false }),
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (!res.ok) return { ok: false, reason: "Media unavailable from WhatsApp history" };
      payload = await res.json();
    } catch {
      return { ok: false, reason: "Media could not be downloaded from WhatsApp right now." };
    }

    const base64 = typeof payload?.base64 === "string" ? payload.base64 : "";
    if (!base64) return { ok: false, reason: "Media unavailable from WhatsApp history" };
    const mimetype = String(payload?.mimetype ?? media["mimetype"] ?? "application/octet-stream");
    const filename = String(media["filename"] ?? payload?.fileName ?? `${providerId}`);
    const bytes = Buffer.from(base64, "base64");

    const path = `${message.company_id}/${message.thread_id}/${message.id}.${extFor(mimetype, filename)}`;
    const upload = await supabaseAdmin.storage
      .from("whatsapp-media")
      .upload(path, bytes, { contentType: mimetype.split(";")[0] ?? "application/octet-stream", upsert: true });
    if (upload.error) return { ok: false, reason: "Media could not be stored. Please try again." };

    await supabaseAdmin
      .from("messages")
      .update({
        metadata: {
          ...meta,
          media_path: path,
          media: { ...media, mimetype, filesize: bytes.length, filename },
        },
      })
      .eq("id", message.id);

    const url = await sign(path);
    if (!url) return { ok: false, reason: "Media could not be prepared. Please try again." };
    return { ok: true, url, mimetype, filename };
  });
