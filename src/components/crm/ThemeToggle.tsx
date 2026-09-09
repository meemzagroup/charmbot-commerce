import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeChoice } from "@/lib/theme";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({ withLabels = false }: { withLabels?: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Interface theme"
      className="inline-flex items-center gap-1 rounded-md border border-line bg-panel2 p-1"
    >
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${o.label} theme`}
            onClick={() => setTheme(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {withLabels && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
