import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type WhatsappTemplate = Tables<"whatsapp_templates">;
export type WhatsappCampaign = Tables<"whatsapp_campaigns">;
export type WhatsappCampaignLog = Tables<"whatsapp_campaign_logs">;

export const TEMPLATE_CATEGORIES = ["marketing", "transactional", "utility"] as const;
export const PLACEHOLDERS = ["{{name}}", "{{phone}}", "{{company}}"] as const;

export function renderTemplate(
  content: string,
  vars: { name?: string | null; phone?: string | null; company?: string | null },
) {
  return content
    .replace(/\{\{\s*name\s*\}\}/gi, vars.name?.trim() || "there")
    .replace(/\{\{\s*phone\s*\}\}/gi, vars.phone?.trim() || "")
    .replace(/\{\{\s*company\s*\}\}/gi, vars.company?.trim() || "");
}

/* ---------------------------------------------------------------- */
/* Templates                                                         */
/* ---------------------------------------------------------------- */

export async function fetchTemplates(): Promise<WhatsappTemplate[]> {
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTemplate(input: { name: string; content: string; category: string }) {
  const { error } = await supabase.from("whatsapp_templates").insert(input);
  if (error) throw error;
}

export async function updateTemplate(
  id: string,
  patch: Partial<{ name: string; content: string; category: string }>,
) {
  const { error } = await supabase.from("whatsapp_templates").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteTemplate(id: string) {
  const { error } = await supabase.from("whatsapp_templates").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------------------------------------------------------- */
/* Campaigns                                                         */
/* ---------------------------------------------------------------- */

export type CampaignWithTemplate = WhatsappCampaign & {
  whatsapp_templates: Pick<WhatsappTemplate, "id" | "name" | "content"> | null;
};

export async function fetchCampaigns(): Promise<CampaignWithTemplate[]> {
  const { data, error } = await supabase
    .from("whatsapp_campaigns")
    .select("*, whatsapp_templates(id, name, content)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CampaignWithTemplate[];
}

export async function fetchCampaignLogs(campaignId: string): Promise<WhatsappCampaignLog[]> {
  const { data, error } = await supabase
    .from("whatsapp_campaign_logs")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function setCampaignStatus(id: string, status: string) {
  const { error } = await supabase.from("whatsapp_campaigns").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteCampaign(id: string) {
  const { error } = await supabase.from("whatsapp_campaigns").delete().eq("id", id);
  if (error) throw error;
}

/** Creates a campaign plus one pending log per (opted-in) recipient. */
export async function createCampaign(input: {
  title: string;
  templateId: string;
  templateContent: string;
  instanceName: string;
  scheduledAt: string | null;
  companyName: string | null;
  recipients: { id: string | null; full_name: string | null; phone: string | null }[];
}) {
  const targets = input.recipients.filter((r) => (r.phone ?? "").replace(/\D/g, "").length >= 8);
  const { data, error } = await supabase
    .from("whatsapp_campaigns")
    .insert({
      title: input.title,
      template_id: input.templateId,
      instance_name: input.instanceName,
      total_contacts: targets.length,
      scheduled_at: input.scheduledAt,
      status: input.scheduledAt ? "scheduled" : "in_progress",
    })
    .select("id")
    .single();
  if (error) throw error;

  if (targets.length) {
    const rows = targets.map((r) => ({
      campaign_id: data.id,
      customer_id: r.id,
      phone_number: (r.phone ?? "").trim(),
      rendered_message: renderTemplate(input.templateContent, {
        name: r.full_name,
        phone: r.phone,
        company: input.companyName,
      }),
      status: "pending",
    }));
    const logs = await supabase.from("whatsapp_campaign_logs").insert(rows);
    if (logs.error) throw logs.error;
  }
  return data.id;
}

export function campaignProgress(logs: WhatsappCampaignLog[]) {
  const count = (s: string) => logs.filter((l) => l.status === s).length;
  return {
    total: logs.length,
    pending: count("pending"),
    sent: count("sent"),
    delivered: count("delivered"),
    read: count("read"),
    failed: count("failed"),
    optedOut: count("opted_out"),
    done: logs.filter((l) => l.status !== "pending").length,
  };
}
