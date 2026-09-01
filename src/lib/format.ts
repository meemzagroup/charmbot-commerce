export function currency(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return `Rs ${n.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
}

export function compactCurrency(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (n >= 1_000_000) return `Rs ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `Rs ${(n / 1_000).toFixed(1)}k`;
  return `Rs ${n}`;
}

export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
