/**
 * Shared WhatsApp message parsing + presentation helpers.
 *
 * Used by the Evolution webhook, the history importer and the Inbox UI so a
 * message looks the same however it entered the CRM.
 */

export type WaMediaKind = "image" | "audio" | "video" | "document" | "sticker";

export type WaMedia = {
  kind: WaMediaKind;
  mimetype?: string | null;
  filename?: string | null;
  filesize?: number | null;
  /** seconds, voice notes / audio / video */
  duration?: number | null;
  /** true for a push-to-talk voice note */
  ptt?: boolean;
};

export type WaParsed = {
  /** raw WhatsApp message type, e.g. audioMessage */
  type: string;
  /** text shown in the bubble / preview */
  content: string;
  caption?: string | null;
  media?: WaMedia | null;
  contact?: { name: string; phones: string[] } | null;
  location?: { latitude: number; longitude: number; name?: string | null; address?: string | null } | null;
  quoted?: { text: string; sender?: string | null } | null;
  reaction?: { emoji: string; target?: string | null } | null;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  if (v && typeof v === "object" && "low" in (v as Record<string, unknown>)) {
    const low = (v as { low?: unknown }).low;
    if (typeof low === "number") return low;
  }
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Pull name + phone numbers out of a vCard payload. */
export function parseVcard(vcard: string, fallbackName?: string) {
  const name =
    /^FN:(.+)$/im.exec(vcard)?.[1]?.trim() ||
    (fallbackName ?? "").trim() ||
    "Contact";
  const phones = Array.from(vcard.matchAll(/waid=(\d+)|^TEL[^:]*:(.+)$/gim))
    .map((m) => (m[1] ? `+${m[1]}` : (m[2] ?? "").trim()))
    .filter(Boolean);
  return { name, phones: Array.from(new Set(phones)) };
}

type WaQuoted = { text: string; sender?: string | null } | null;

function quotedFrom(node: Record<string, any> | undefined | null): WaQuoted {
  const ctx = node?.["contextInfo"];
  const q = ctx?.["quotedMessage"];
  if (!q) return null;
  const inner = parseWaMessage(q, "quoted");
  return { text: inner.content, sender: str(ctx?.["participant"]).split("@")[0] || null };
}

/**
 * Turn an Evolution `message` object into everything the CRM needs to store
 * and render. Never returns a bare "[audioMessage]" style placeholder.
 */
export function parseWaMessage(
  message: Record<string, any> | undefined | null,
  messageType?: string | null,
): WaParsed {
  const m = message ?? {};
  const type =
    (messageType && messageType !== "unknown" ? messageType : "") ||
    Object.keys(m).find((k) => k.endsWith("Message")) ||
    (m["conversation"] ? "conversation" : "unknown");

  const base = (node: Record<string, any> | undefined): WaQuoted => quotedFrom(node);

  if (m["conversation"]) {
    return { type: "conversation", content: String(m["conversation"]), quoted: null };
  }
  if (m["extendedTextMessage"]) {
    const n = m["extendedTextMessage"];
    return { type: "extendedTextMessage", content: str(n?.["text"]), quoted: base(n) };
  }
  if (m["imageMessage"]) {
    const n = m["imageMessage"];
    const caption = str(n?.["caption"]);
    return {
      type: "imageMessage",
      content: caption || "Photo",
      caption: caption || null,
      quoted: base(n),
      media: {
        kind: "image",
        mimetype: str(n?.["mimetype"]) || "image/jpeg",
        filesize: num(n?.["fileLength"]),
      },
    };
  }
  if (m["stickerMessage"]) {
    const n = m["stickerMessage"];
    return {
      type: "stickerMessage",
      content: "Sticker",
      quoted: base(n),
      media: { kind: "sticker", mimetype: str(n?.["mimetype"]) || "image/webp" },
    };
  }
  if (m["videoMessage"]) {
    const n = m["videoMessage"];
    const caption = str(n?.["caption"]);
    return {
      type: "videoMessage",
      content: caption || "Video",
      caption: caption || null,
      quoted: base(n),
      media: {
        kind: "video",
        mimetype: str(n?.["mimetype"]) || "video/mp4",
        filesize: num(n?.["fileLength"]),
        duration: num(n?.["seconds"]),
      },
    };
  }
  if (m["audioMessage"]) {
    const n = m["audioMessage"];
    const ptt = n?.["ptt"] === true;
    return {
      type: "audioMessage",
      content: ptt ? "Voice message" : "Audio",
      quoted: base(n),
      media: {
        kind: "audio",
        ptt,
        mimetype: str(n?.["mimetype"]) || "audio/ogg",
        filesize: num(n?.["fileLength"]),
        duration: num(n?.["seconds"]),
      },
    };
  }
  if (m["documentMessage"] || m["documentWithCaptionMessage"]) {
    const n = m["documentMessage"] ?? m["documentWithCaptionMessage"]?.["message"]?.["documentMessage"] ?? {};
    const filename = str(n?.["fileName"]) || "Document";
    const caption = str(n?.["caption"]);
    return {
      type: "documentMessage",
      content: caption || filename,
      caption: caption || null,
      quoted: base(n),
      media: {
        kind: "document",
        filename,
        mimetype: str(n?.["mimetype"]) || "application/octet-stream",
        filesize: num(n?.["fileLength"]),
      },
    };
  }
  if (m["contactMessage"] || m["contactsArrayMessage"]) {
    const list = m["contactsArrayMessage"]?.["contacts"] ?? [m["contactMessage"]];
    const first = list?.[0] ?? {};
    const parsed = parseVcard(str(first?.["vcard"]), str(first?.["displayName"]));
    return {
      type: "contactMessage",
      content: `Contact: ${parsed.name}${parsed.phones[0] ? ` (${parsed.phones[0]})` : ""}`,
      contact: parsed,
    };
  }
  if (m["locationMessage"] || m["liveLocationMessage"]) {
    const n = m["locationMessage"] ?? m["liveLocationMessage"];
    const latitude = num(n?.["degreesLatitude"]) ?? 0;
    const longitude = num(n?.["degreesLongitude"]) ?? 0;
    const name = str(n?.["name"]) || null;
    return {
      type: "locationMessage",
      content: `Location${name ? `: ${name}` : ""}`,
      location: { latitude, longitude, name, address: str(n?.["address"]) || null },
    };
  }
  if (m["reactionMessage"]) {
    const n = m["reactionMessage"];
    const emoji = str(n?.["text"]) || "👍";
    return {
      type: "reactionMessage",
      content: `Reacted ${emoji}`,
      reaction: { emoji, target: str(n?.["key"]?.["id"]) || null },
    };
  }
  if (m["buttonsResponseMessage"]) {
    return {
      type: "buttonsResponseMessage",
      content: str(m["buttonsResponseMessage"]?.["selectedDisplayText"]) || "Button reply",
    };
  }
  if (m["listResponseMessage"]) {
    return {
      type: "listResponseMessage",
      content:
        str(m["listResponseMessage"]?.["title"]) ||
        str(m["listResponseMessage"]?.["singleSelectReply"]?.["selectedRowId"]) ||
        "List reply",
    };
  }
  if (m["templateMessage"] || m["interactiveMessage"] || m["viewOnceMessage"] || m["ephemeralMessage"]) {
    const inner =
      m["viewOnceMessage"]?.["message"] ??
      m["ephemeralMessage"]?.["message"] ??
      m["templateMessage"]?.["hydratedTemplate"] ??
      null;
    if (inner) return parseWaMessage(inner, null);
  }
  if (m["protocolMessage"]) {
    return { type: "protocolMessage", content: "Message was deleted" };
  }

  const pretty = type.replace(/Message$/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
  return {
    type,
    content: pretty ? `${pretty.charAt(0).toUpperCase()}${pretty.slice(1)} message` : "Message",
  };
}

/** Metadata blob stored on public.messages.metadata for a WhatsApp message. */
export function waMessageMetadata(parsed: WaParsed, extra: Record<string, unknown>) {
  return {
    ...extra,
    message_type: parsed.type,
    ...(parsed.caption ? { caption: parsed.caption } : {}),
    ...(parsed.media ? { media: parsed.media } : {}),
    ...(parsed.contact ? { contact: parsed.contact } : {}),
    ...(parsed.location ? { location: parsed.location } : {}),
    ...(parsed.quoted ? { quoted: parsed.quoted } : {}),
    ...(parsed.reaction ? { reaction: parsed.reaction } : {}),
  };
}

const KIND_ICON: Record<WaMediaKind, string> = {
  image: "📷",
  audio: "🎤",
  video: "🎬",
  document: "📄",
  sticker: "🌟",
};

/** WhatsApp-style one-line preview for the conversation list. */
export function waPreviewText(content: string, metadata: unknown): string {
  const meta = (metadata ?? {}) as Record<string, any>;
  const media = meta["media"] as WaMedia | undefined;
  const legacy = /^\[(\w+)\]$/.exec(content ?? "")?.[1];
  const kind =
    media?.kind ??
    (legacy === "audioMessage"
      ? "audio"
      : legacy === "imageMessage"
        ? "image"
        : legacy === "videoMessage"
          ? "video"
          : legacy === "documentMessage"
            ? "document"
            : legacy === "stickerMessage"
              ? "sticker"
              : null);
  if (kind) {
    const label =
      kind === "audio"
        ? media?.ptt === false
          ? "Audio"
          : "Voice message"
        : kind === "image"
          ? "Photo"
          : kind === "video"
            ? "Video"
            : kind === "document"
              ? (media?.filename ?? "Document")
              : "Sticker";
    const caption = meta["caption"] ? ` · ${String(meta["caption"])}` : "";
    return `${KIND_ICON[kind]} ${label}${caption}`;
  }
  if (meta["contact"]) return `👤 ${content}`;
  if (meta["location"]) return `📍 ${content}`;
  if (legacy === "contactMessage") return "👤 Contact";
  if (legacy === "locationMessage") return "📍 Location";
  if (legacy) return "Message";
  return content;
}

export function waFormatDuration(seconds: number | null | undefined) {
  const s = Math.max(0, Math.round(Number(seconds ?? 0)));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function waFormatSize(bytes: number | null | undefined) {
  const b = Number(bytes ?? 0);
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
