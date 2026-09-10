import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Download,
  FileText,
  Image as ImageIcon,
  MapPin,
  Mic,
  User as UserIcon,
  Video as VideoIcon,
} from "lucide-react";
import { getWhatsappMedia, type MediaResult } from "@/lib/whatsapp-media.functions";
import { waFormatDuration, waFormatSize, type WaMedia, type WaMediaKind } from "@/lib/wa-message";
import type { CommMessage } from "@/lib/comms-queries";

const LEGACY_KIND: Record<string, WaMediaKind> = {
  imageMessage: "image",
  audioMessage: "audio",
  videoMessage: "video",
  documentMessage: "document",
  stickerMessage: "sticker",
};

function useMedia(messageId: string, enabled: boolean) {
  const load = useServerFn(getWhatsappMedia);
  return useQuery<MediaResult>({
    queryKey: ["wa-media", messageId],
    queryFn: () => load({ data: { messageId } }),
    enabled,
    staleTime: 50 * 60 * 1000,
    retry: false,
  });
}

function MediaFrame({
  message,
  kind,
  media,
  autoload,
  label,
  icon,
}: {
  message: CommMessage;
  kind: WaMediaKind;
  media: WaMedia | null;
  autoload: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  const [requested, setRequested] = useState(autoload);
  const { data, isFetching } = useMedia(message.id, requested);

  if (!requested) {
    return (
      <button
        type="button"
        onClick={() => setRequested(true)}
        className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-xs hover:bg-panel2"
      >
        {icon}
        <span>{label}</span>
        {media?.duration ? (
          <span className="text-muted-foreground">{waFormatDuration(media.duration)}</span>
        ) : null}
        {media?.filesize ? (
          <span className="text-muted-foreground">{waFormatSize(media.filesize)}</span>
        ) : null}
      </button>
    );
  }

  if (isFetching && !data) {
    return <div className="text-xs text-muted-foreground py-2">Loading {label.toLowerCase()}…</div>;
  }

  if (!data?.ok) {
    return (
      <div className="text-xs text-muted-foreground py-1.5">
        {data && !data.ok ? data.reason : "Media unavailable from WhatsApp history"}
      </div>
    );
  }

  if (kind === "image" || kind === "sticker") {
    return (
      <a href={data.url} target="_blank" rel="noreferrer" className="block">
        <img
          src={data.url}
          alt={media?.filename ?? "WhatsApp photo"}
          loading="lazy"
          className={
            kind === "sticker"
              ? "h-28 w-28 object-contain"
              : "max-h-64 rounded-md border border-line object-cover"
          }
        />
      </a>
    );
  }

  if (kind === "audio") {
    return (
      <audio controls preload="metadata" src={data.url} className="w-64 max-w-full">
        <track kind="captions" />
      </audio>
    );
  }

  if (kind === "video") {
    return (
      <video controls preload="metadata" src={data.url} className="max-h-64 rounded-md border border-line">
        <track kind="captions" />
      </video>
    );
  }

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noreferrer"
      download={data.filename}
      className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-xs hover:bg-panel2"
    >
      <FileText className="size-4 text-brand" />
      <span className="truncate max-w-[220px]">{media?.filename ?? data.filename}</span>
      <Download className="size-3.5 text-muted-foreground" />
    </a>
  );
}

/** Renders a WhatsApp message body: text, photo, voice note, video, document, contact, location. */
export function WhatsappMessageBody({ message }: { message: CommMessage }) {
  const meta = (message.metadata ?? {}) as Record<string, any>;
  const media = (meta["media"] ?? null) as WaMedia | null;
  const legacy = /^\[(\w+)\]$/.exec(message.content ?? "")?.[1];
  const type = String(meta["message_type"] ?? legacy ?? "");
  const kind: WaMediaKind | null = media?.kind ?? LEGACY_KIND[type] ?? null;
  const caption = meta["caption"] ? String(meta["caption"]) : null;
  const quoted = meta["quoted"] as { text?: string; sender?: string | null } | undefined;
  const contact = meta["contact"] as { name?: string; phones?: string[] } | undefined;
  const location = meta["location"] as
    | { latitude?: number; longitude?: number; name?: string | null; address?: string | null }
    | undefined;

  const text = legacy ? "" : (message.content ?? "");

  return (
    <div className="space-y-2">
      {quoted?.text && (
        <div className="border-l-2 border-brand/50 pl-2 text-[11px] text-muted-foreground line-clamp-3">
          {quoted.sender ? `${quoted.sender}: ` : ""}
          {quoted.text}
        </div>
      )}

      {kind && (
        <MediaFrame
          message={message}
          kind={kind}
          media={media}
          autoload={kind === "image" || kind === "sticker"}
          label={
            kind === "image"
              ? "Show photo"
              : kind === "audio"
                ? media?.ptt === false
                  ? "Play audio"
                  : "Play voice message"
                : kind === "video"
                  ? "Play video"
                  : kind === "sticker"
                    ? "Show sticker"
                    : (media?.filename ?? "Open document")
          }
          icon={
            kind === "image" || kind === "sticker" ? (
              <ImageIcon className="size-4 text-brand" />
            ) : kind === "audio" ? (
              <Mic className="size-4 text-brand" />
            ) : kind === "video" ? (
              <VideoIcon className="size-4 text-brand" />
            ) : (
              <FileText className="size-4 text-brand" />
            )
          }
        />
      )}

      {contact && (
        <div className="rounded-md border border-line bg-panel px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <UserIcon className="size-4 text-brand" />
            <span className="font-medium">{contact.name ?? "Contact"}</span>
          </div>
          {(contact.phones ?? []).map((p) => (
            <a key={p} href={`tel:${p}`} className="block text-xs text-muted-foreground hover:text-foreground">
              {p}
            </a>
          ))}
        </div>
      )}

      {location?.latitude != null && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-xs hover:bg-panel2"
        >
          <MapPin className="size-4 text-brand" />
          <span>
            {location.name || location.address || `${location.latitude}, ${location.longitude}`}
          </span>
        </a>
      )}

      {caption && <p className="whitespace-pre-wrap leading-relaxed">{caption}</p>}
      {!caption && text && !contact && !location && (
        <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
      )}
      {legacy && !kind && !contact && !location && (
        <p className="text-xs text-muted-foreground">
          {type === "contactMessage"
            ? "Shared contact — open in WhatsApp"
            : type === "locationMessage"
              ? "Shared location — open in WhatsApp"
              : "Message type not supported for preview"}
        </p>
      )}
      {!kind && !text && !caption && !contact && !location && !legacy && (
        <p className="text-xs text-muted-foreground">Empty message</p>
      )}
    </div>
  );
}
