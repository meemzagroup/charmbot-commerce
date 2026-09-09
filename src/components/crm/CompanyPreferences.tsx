import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Globe, Coins } from "lucide-react";
import { getMyPlan } from "@/lib/plan.functions";
import {
  saveCompanyPreferences,
  saveCompanyLogo,
  listCurrencies,
} from "@/lib/company-settings.functions";
import { CompanyLogoField } from "@/components/crm/CompanyLogoField";
import { LANGUAGES, useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function CompanyPreferences() {
  const qc = useQueryClient();
  const planFn = useServerFn(getMyPlan);
  const saveFn = useServerFn(saveCompanyPreferences);
  const currenciesFn = useServerFn(listCurrencies);
  const logoFn = useServerFn(saveCompanyLogo);
  const { setLang } = useI18n();

  const { data: plan } = useQuery({ queryKey: ["my-plan"], queryFn: () => planFn({}) });
  const { data: currencies = [] } = useQuery({
    queryKey: ["currencies"],
    queryFn: () => currenciesFn({}),
  });

  const [language, setLanguage] = useState("en");
  const [currency, setCurrency] = useState("PKR");

  useEffect(() => {
    if (plan) {
      setLanguage(plan.language);
      setCurrency(plan.currency);
    }
  }, [plan]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { language, currency } }),
    onSuccess: () => {
      toast.success("Preferences saved");
      setLang(language as never);
      void qc.invalidateQueries({ queryKey: ["my-plan"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-lg border border-line bg-panel p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Language & Currency</h2>
        <p className="text-xs text-muted-foreground">
          Company defaults. Subscription: {plan?.packageName ?? "none"} ·{" "}
          {plan?.active ? "active" : "inactive"}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label className="flex items-center gap-2">
            <Globe className="size-3.5" /> Language
          </Label>
          <select
            className="mt-1 w-full h-10 rounded-md bg-panel2 border border-line px-3 text-sm"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="flex items-center gap-2">
            <Coins className="size-3.5" /> Currency
          </Label>
          <select
            className="mt-1 w-full h-10 rounded-md bg-panel2 border border-line px-3 text-sm"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {currencies.map((c: any) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name} ({c.symbol})
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        Save preferences
      </Button>

      <div className="grid gap-3 pt-2 border-t border-line">
        <CompanyLogoField
          companyId={plan?.companyId ?? null}
          value={plan?.logoRef ?? ""}
          onChange={(next) => {
            void logoFn({ data: { logoUrl: next || null } })
              .then(() => {
                toast.success("Company logo updated");
                return qc.invalidateQueries({ queryKey: ["my-plan"] });
              })
              .catch((e: Error) => toast.error(e.message));
          }}
        />
      </div>
    </section>
  );
}
