import { supabase } from "@/integrations/supabase/client";

export const LOGO_BUCKET = "company-logos";
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_ACCEPT = "image/png,image/jpeg";
export const LOGO_HINT = "PNG or JPG · recommended 512×512 px (square) · max 2 MB";

export function isExternalLogo(value?: string | null) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

/** Turns a stored logo reference into a displayable URL (signed for private storage). */
export async function resolveLogoUrl(value?: string | null): Promise<string | null> {
  if (!value) return null;
  if (isExternalLogo(value)) return value;
  const { data } = await supabase.storage.from(LOGO_BUCKET).createSignedUrl(value, 3600);
  return data?.signedUrl ?? null;
}

export function validateLogoFile(file: File): string | null {
  const okType = ["image/png", "image/jpeg"].includes(file.type);
  if (!okType) return "Only PNG, JPG or JPEG images are allowed";
  if (file.size > LOGO_MAX_BYTES) return "Image is too large — maximum size is 2 MB";
  return null;
}

/** Uploads a logo into the company's own folder and returns the stored path. */
export async function uploadCompanyLogo(companyId: string, file: File): Promise<string> {
  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${companyId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeStoredLogo(value?: string | null) {
  if (!value || isExternalLogo(value)) return;
  await supabase.storage.from(LOGO_BUCKET).remove([value]);
}
