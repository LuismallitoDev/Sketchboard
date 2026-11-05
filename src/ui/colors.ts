/** Colour families, five shades each (light to dark). Values follow the Tailwind palette (MIT). */
export const PALETTE: { name: string; shades: readonly string[] }[] = [
  { name: "gray", shades: ["#e5e7eb", "#9ca3af", "#6b7280", "#374151", "#111827"] },
  { name: "red", shades: ["#fecaca", "#fca5a5", "#ef4444", "#b91c1c", "#7f1d1d"] },
  { name: "pink", shades: ["#fbcfe8", "#f9a8d4", "#ec4899", "#be185d", "#831843"] },
  { name: "purple", shades: ["#e9d5ff", "#d8b4fe", "#a855f7", "#7e22ce", "#581c87"] },
  { name: "violet", shades: ["#ddd6fe", "#c4b5fd", "#8b5cf6", "#6d28d9", "#4c1d95"] },
  { name: "blue", shades: ["#bfdbfe", "#93c5fd", "#3b82f6", "#1d4ed8", "#1e3a8a"] },
  { name: "cyan", shades: ["#a5f3fc", "#67e8f9", "#06b6d4", "#0e7490", "#164e63"] },
  { name: "teal", shades: ["#99f6e4", "#5eead4", "#14b8a6", "#0f766e", "#134e4a"] },
  { name: "green", shades: ["#bbf7d0", "#86efac", "#22c55e", "#15803d", "#14532d"] },
  { name: "yellow", shades: ["#fef08a", "#fde047", "#eab308", "#a16207", "#713f12"] },
  { name: "orange", shades: ["#fed7aa", "#fdba74", "#f97316", "#c2410c", "#7c2d12"] },
];

export const STROKE_TOP_PICKS = ["#1e1e1e", "#dc2626", "#16a34a", "#2563eb", "#ea580c"] as const;
export const BACKGROUND_TOP_PICKS = ["transparent", "#fecaca", "#bbf7d0", "#bfdbfe", "#fef08a"] as const;
export const VIEW_BACKGROUNDS = ["#ffffff", "#f8f9fa", "#f5faff", "#fffce8", "#fdf8f6"] as const;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Normalises user input like "ff8800" or "#F80" to a lowercase "#rrggbb"-style string, or null if invalid. */
export function normalizeHex(input: string): string | null {
  const m = HEX.exec(input.trim());
  if (!m) return null;
  return "#" + m[1].toLowerCase();
}
