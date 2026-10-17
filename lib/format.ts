export function money(cents: number | null): string {
  if (cents == null) return "Trade only";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = ["#2d4a85", "#1f7a4d", "#8a3ffc", "#a15c00", "#b8336a", "#0f6e7a", "#5b4636"];
export function avatarColor(seed: number | string): string {
  const n = typeof seed === "number" ? seed : [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

export function eventDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function daysUntil(ts: number): number {
  return Math.ceil((ts - Date.now()) / 86400_000);
}

/** Picks black or white text for a background color (WCAG relative luminance). */
export function onColor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.36 ? "#111111" : "#ffffff";
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  held: "Held in escrow",
  disputed: "In dispute",
  released: "Released to seller",
  refunded: "Refunded",
};
