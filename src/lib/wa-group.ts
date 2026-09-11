/**
 * Group metadata lookup (Evolution API).
 *
 * A group conversation must be named after the WhatsApp group subject, never
 * after whichever member happened to send the first message. When the group
 * metadata cannot be read we fall back to a clearly temporary label instead.
 */

export async function fetchGroupSubject(
  baseUrl: string,
  apiKey: string,
  instanceKey: string,
  groupJid: string,
): Promise<string | null> {
  const jid = groupJid.includes("@") ? groupJid : `${groupJid}@g.us`;
  const instance = encodeURIComponent(instanceKey);
  const headers = { apikey: apiKey, "Content-Type": "application/json" };
  const urls = [
    `${baseUrl}/group/findGroupInfos/${instance}?groupJid=${encodeURIComponent(jid)}`,
    `${baseUrl}/group/fetchAllGroups/${instance}?getParticipants=false`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
      if (!res.ok) continue;
      const json: any = await res.json().catch(() => null);
      const list: any[] = Array.isArray(json) ? json : json ? [json] : [];
      const match =
        list.find((g) => String(g?.id ?? "").split("@")[0] === jid.split("@")[0]) ?? (list.length === 1 ? list[0] : null);
      const subject = String(match?.subject ?? match?.name ?? "").trim();
      if (subject) return subject.slice(0, 200);
    } catch {
      // network/instance issues fall through to the caller's fallback name
    }
  }
  return null;
}
