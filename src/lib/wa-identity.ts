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

/**
 * WhatsApp's newer "lid" addressing hides the real number behind an internal id
 * (`43740685156572@lid`) and puts the real one in `remoteJidAlt`. Always resolve
 * to the real phone JID so one person stays one conversation.
 */
export function waResolveJid(key: {
  remoteJid?: string | null;
  remoteJidAlt?: string | null;
  addressingMode?: string | null;
} | null | undefined): string {
  const jid = (key?.remoteJid ?? "").trim();
  const alt = (key?.remoteJidAlt ?? "").trim();
  // A group conversation is ALWAYS identified by its group JID. In "lid"
  // addressing the alt field carries the individual participant, so swapping
  // it in would split one group into one thread per member.
  if (isGroupJid(jid)) return jid;
  if (alt && (jid.endsWith("@lid") || key?.addressingMode === "lid")) return alt;
  return jid;
}

/**
 * The individual member who sent a message inside a group. Never used as the
 * conversation key — only as the per-message sender label.
 */
export function waParticipantJid(key: {
  participant?: string | null;
  participantAlt?: string | null;
  participantPn?: string | null;
} | null | undefined): string {
  const p = (key?.participant ?? "").trim();
  const alt = (key?.participantAlt ?? key?.participantPn ?? "").trim();
  if (alt && p.endsWith("@lid")) return alt;
  return p || alt;
}

/** WhatsApp group ids are long numeric ids; contacts collapse to 10 digits. */
export function waIsGroupKey(contactKey: string | null | undefined): boolean {
  return /^\d{13,}$/.test((contactKey ?? "").trim());
}

export function waGroupFallbackName(contactKey: string): string {
  return `WhatsApp Group • ${contactKey}`;
}

/** The handle stored on the thread: full numeric address without device suffix. */
export function waStoredHandle(jid: string | null | undefined): string {
  const bare = waBareJid(jid);
  const digits = waDigits(bare);
  return digits || bare;
}
