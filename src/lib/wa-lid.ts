/**
 * WhatsApp "lid" addressing support.
 *
 * Newer WhatsApp sessions deliver some chats addressed by an internal id
 * (`108293473181707@lid`) instead of the real phone JID. When the payload also
 * carries `remoteJidAlt` we can resolve it immediately (see waResolveJid).
 * Stored history and some webhook events arrive WITHOUT that alt field, which
 * used to create a second conversation keyed by the internal id — the inbox row
 * that opens empty while the real messages sit in the phone-keyed thread.
 *
 * We therefore remember every lid -> phone pair we ever observe in
 * public.whatsapp_lid_map, and consult it before resolving a conversation.
 */

import { waBareJid, waDigits } from "@/lib/wa-identity";

type AnyClient = { from: (table: string) => any };

export type LidPair = { lidKey: string; phoneKey: string };

function bare(value: unknown): string {
  return waBareJid(String(value ?? ""));
}

/** Collect lid -> phone pairs from any Evolution message key shape. */
export function collectLidPairsFromKey(key: unknown, into: Map<string, string>) {
  if (!key || typeof key !== "object") return;
  const k = key as Record<string, unknown>;
  const pairs: Array<[unknown, unknown]> = [
    [k["remoteJid"], k["remoteJidAlt"]],
    [k["participant"], k["participantAlt"] ?? k["participantPn"]],
  ];
  for (const [rawId, rawAlt] of pairs) {
    const id = String(rawId ?? "");
    const alt = String(rawAlt ?? "");
    if (!id.endsWith("@lid") || !alt) continue;
    const lidKey = waDigits(bare(id));
    const phoneKey = waDigits(bare(alt));
    if (lidKey && phoneKey && lidKey !== phoneKey) into.set(lidKey, phoneKey);
  }
}

/** Walk an arbitrary Evolution payload (chat list, message list) for pairs. */
export function collectLidPairs(records: unknown, into = new Map<string, string>()) {
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    if (obj["key"]) collectLidPairsFromKey(obj["key"], into);
    collectLidPairsFromKey(obj, into);
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") visit(value, depth + 1);
    }
  };
  visit(records, 0);
  return into;
}

export async function persistLidPairs(
  client: AnyClient,
  companyId: string,
  channelId: string,
  pairs: Map<string, string>,
) {
  if (pairs.size === 0) return;
  const rows = [...pairs.entries()].map(([lidKey, phoneKey]) => ({
    company_id: companyId,
    whatsapp_channel_id: channelId,
    lid_key: lidKey,
    phone_key: phoneKey,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    await client
      .from("whatsapp_lid_map")
      .upsert(rows.slice(i, i + 200), { onConflict: "company_id,whatsapp_channel_id,lid_key" });
  }
}

export async function loadLidMap(
  client: AnyClient,
  companyId: string,
  channelId: string,
): Promise<Map<string, string>> {
  const { data } = await client
    .from("whatsapp_lid_map")
    .select("lid_key, phone_key")
    .eq("company_id", companyId)
    .eq("whatsapp_channel_id", channelId);
  return new Map((data ?? []).map((r: any) => [String(r.lid_key), String(r.phone_key)]));
}

/** Pull lid -> phone pairs out of the connected session's chat list. */
export async function fetchLidPairsFromChats(
  baseUrl: string,
  apiKey: string,
  instanceKey: string,
): Promise<Map<string, string>> {
  const pairs = new Map<string, string>();
  try {
    const res = await fetch(`${baseUrl}/chat/findChats/${encodeURIComponent(instanceKey)}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return pairs;
    collectLidPairs(await res.json().catch(() => null), pairs);
  } catch {
    // offline / unsupported endpoint: callers fall back to payload-only pairs
  }
  return pairs;
}

/**
 * Replace a lid JID with the real phone JID when the mapping is known.
 * Group JIDs and normal phone JIDs are returned unchanged.
 */
export function applyLidMap(jid: string, map: Map<string, string>): string {
  if (!jid.endsWith("@lid")) return jid;
  const phone = map.get(waDigits(waBareJid(jid)));
  return phone ? `${phone}@s.whatsapp.net` : jid;
}
