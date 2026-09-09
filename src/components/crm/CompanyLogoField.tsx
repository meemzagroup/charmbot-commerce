import { useEffect, useRef, useState } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LOGO_ACCEPT,
  LOGO_HINT,
  isExternalLogo,
  removeStoredLogo,
  resolveLogoUrl,
  uploadCompanyLogo,
  validateLogoFile,
} from "@/lib/company-logo";

export function CompanyLogoField({
  companyId,
  value,
  onChange,
}: {
  companyId?: string | null;
  value?: string | null;
  onChange: (next: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void resolveLogoUrl(value).then((url) => {
      if (alive) setPreview(url);
    });
    return () => {
      alive = false;
    };
  }, [value]);

  async function pick(file: File | undefined) {
    if (!file) return;
    const problem = validateLogoFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (!companyId) {
      toast.error("Save the company first, then upload its logo");
      return;
    }
    setBusy(true);
    try {
      const previous = value;
      const path = await uploadCompanyLogo(companyId, file);
      onChange(path);
      if (previous && previous !== path) await removeStoredLogo(previous);
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await removeStoredLogo(value);
      onChange("");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sm:col-span-2 rounded-md border border-line bg-panel2/40 p-4 space-y-3">
      <Label>Company logo</Label>
      <div className="flex items-center gap-4">
        <div className="size-16 shrink-0 rounded-md border border-line bg-panel grid place-items-center overflow-hidden">
          {preview ? (
            <img src={preview} alt="Company logo preview" className="size-full object-contain" />
          ) : (
            <ImageIcon className="size-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={LOGO_ACCEPT}
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4 mr-2" />
            {value ? "Change logo" : "Upload company logo"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void remove()}>
              <Trash2 className="size-4 mr-2" /> Remove logo
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{LOGO_HINT}</p>
      {!companyId && (
        <p className="text-xs text-amber-400">
          Create the company first — the logo can be uploaded right after saving.
        </p>
      )}
      <div>
        <Label className="text-xs text-muted-foreground">Logo URL (optional alternative)</Label>
        <Input
          placeholder="https://…"
          value={isExternalLogo(value) ? (value as string) : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
