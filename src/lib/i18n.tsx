import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Lightweight translation layer. Add a new language by appending a dictionary
 * here — no UI rewrite required. Missing keys fall back to English.
 */

export const LANGUAGES = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ur", label: "اردو", dir: "rtl" },
  { code: "ar", label: "العربية", dir: "rtl" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

const DICTIONARIES: Record<string, Record<string, string>> = {
  en: {
    "nav.overview": "Overview",
    "nav.orders": "Orders",
    "nav.inbox": "Omnichannel / Inbox",
    "nav.campaigns": "WhatsApp Campaigns",
    "nav.customers": "Customers",
    "nav.inventory": "Inventory",
    "nav.inquiries": "Inquiries",
    "nav.settings": "Settings",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "settings.language": "Language",
    "settings.currency": "Currency",
    "subscription.expired":
      "Subscription expired — contact administrator / renew subscription.",
    "plan.upgrade": "Upgrade required",
  },
  ur: {
    "nav.overview": "جائزہ",
    "nav.orders": "آرڈرز",
    "nav.inbox": "ان باکس",
    "nav.campaigns": "واٹس ایپ مہمات",
    "nav.customers": "گاہک",
    "nav.inventory": "انوینٹری",
    "nav.inquiries": "استفسارات",
    "nav.settings": "ترتیبات",
    "common.save": "محفوظ کریں",
    "common.cancel": "منسوخ کریں",
    "settings.language": "زبان",
    "settings.currency": "کرنسی",
    "subscription.expired": "سبسکرپشن ختم ہو گئی ہے — براہ کرم تجدید کریں۔",
    "plan.upgrade": "اپ گریڈ درکار ہے",
  },
  ar: {
    "nav.overview": "نظرة عامة",
    "nav.orders": "الطلبات",
    "nav.inbox": "صندوق الوارد",
    "nav.campaigns": "حملات واتساب",
    "nav.customers": "العملاء",
    "nav.inventory": "المخزون",
    "nav.inquiries": "الاستفسارات",
    "nav.settings": "الإعدادات",
    "common.save": "حفظ",
    "common.cancel": "إلغاء",
    "settings.language": "اللغة",
    "settings.currency": "العملة",
    "subscription.expired": "انتهى الاشتراك — يرجى التجديد.",
    "plan.upgrade": "الترقية مطلوبة",
  },
};

type I18nValue = {
  lang: LanguageCode;
  dir: "ltr" | "rtl";
  setLang: (code: LanguageCode) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = "manuta.lang";

export function I18nProvider({
  children,
  companyDefault = "en",
}: {
  children: React.ReactNode;
  companyDefault?: string;
}) {
  const [lang, setLangState] = useState<LanguageCode>("en");

  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? (localStorage.getItem(STORAGE_KEY) as LanguageCode | null) : null;
    const next = (stored ?? (companyDefault as LanguageCode)) || "en";
    setLangState(LANGUAGES.some((l) => l.code === next) ? next : "en");
  }, [companyDefault]);

  const dir = (LANGUAGES.find((l) => l.code === lang)?.dir ?? "ltr") as "ltr" | "rtl";

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((code: LanguageCode) => {
    localStorage.setItem(STORAGE_KEY, code);
    setLangState(code);
  }, []);

  const t = useCallback(
    (key: string) => DICTIONARIES[lang]?.[key] ?? DICTIONARIES['en']?.[key] ?? key,
    [lang],
  );

  const value = useMemo(() => ({ lang, dir, setLang, t }), [lang, dir, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    lang: "en",
    dir: "ltr",
    setLang: () => {},
    t: (key: string) => DICTIONARIES['en']?.[key] ?? key,
  };
}
