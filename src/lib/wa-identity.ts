/**
 * Canonical WhatsApp conversation identity helpers.
 *
 * Mirrors public.wa_contact_key(text) in the database exactly so a contact
 * resolves to the SAME thread whether the row is written by the webhook, the
 * history import or an outgoing reply.
 *
 * Rules:
 * - strip the JID suffix (@s.whatsapp.net / @g.us) and any device part (:12)
 * - group / broadcast ids (13+ digits) keep their full numeric id
 * - person numbers collapse to their last 10 digits, so 03xxxxxxxxx,
 *   +923xxxxxxxxx and 923xxxxxxxxx are one and the same contact
 */

export function waDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function waBareJid(value: string | null | undefined): string {
  const head = (value ?? "").split("@")[0] ?? "";
  return head.split(":")[0] ?? "";
}

export function waContactKey(handle: string | null | undefined): string {
  const digits = waDigits(waBareJid(handle));
  if (digits.length >= 13) return digits;
  if (digits.length === 0) return (handle ?? "").trim().toLowerCase();
  return digits.slice(-10);
}

export function isGroupJid(jid: string | null | undefined): boolean {
  return (jid ?? "").includes("@g.us");
}

export function isStatusJid(jid: string | null | undefined): boolean {
  return (jid ?? "").includes("status@") || (jid ?? "").includes("broadcast");
}

/** The handle stored on the thread: full numeric address without device suffix. */
export function waStoredHandle(jid: string | null | undefined): string {
  const bare = waBareJid(jid);
  const digits = waDigits(bare);
  return digits || bare;
}
