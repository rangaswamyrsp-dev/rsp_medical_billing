/** Expiry helpers — accepts "YYYY-MM" or "YYYY-MM-DD". */
export function expiryTime(expiry: string): number {
  if (!expiry) return Infinity;
  const [y, m, d] = expiry.split("-").map(Number);
  if (!y) return Infinity;
  // month expiry = end of that month
  if (!d) return new Date(y, (m ?? 1), 0, 23, 59, 59).getTime();
  return new Date(y, (m ?? 1) - 1, d, 23, 59, 59).getTime();
}

export function daysToExpiry(expiry: string, now = Date.now()): number {
  const t = expiryTime(expiry);
  if (!isFinite(t)) return Infinity;
  return Math.floor((t - now) / 86_400_000);
}

export type ExpiryWindow = {
  key: string;
  label: string;
  /** upper bound in days; null = expired only */
  days: number | null;
};

export const EXPIRY_WINDOWS: ExpiryWindow[] = [
  { key: "expired", label: "Already expired", days: null },
  { key: "15d", label: "Within 15 days", days: 15 },
  { key: "1m", label: "Within 1 month", days: 30 },
  { key: "2m", label: "Within 2 months", days: 60 },
  { key: "3m", label: "Within 3 months", days: 90 },
  { key: "6m", label: "Within 6 months", days: 180 },
  { key: "7m", label: "Within 7 months", days: 210 },
  { key: "1y", label: "Within 1 year", days: 365 },
];

export function inWindow(expiry: string, windowKey: string, now = Date.now()): boolean {
  const w = EXPIRY_WINDOWS.find((x) => x.key === windowKey);
  if (!w) return true;
  const d = daysToExpiry(expiry, now);
  if (w.days === null) return d < 0;
  return d >= 0 && d <= w.days;
}

export function expiryTone(expiry: string): "expired" | "critical" | "warn" | "ok" {
  const d = daysToExpiry(expiry);
  if (d < 0) return "expired";
  if (d <= 30) return "critical";
  if (d <= 180) return "warn";
  return "ok";
}
