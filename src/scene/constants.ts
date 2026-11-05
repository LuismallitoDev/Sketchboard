import type { FontFamily, ItemStyle } from "./types";

export const LINE_HEIGHT = 1.25;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 30;
/** Smallest allowed element size when resizing. */
export const MIN_SIZE = 2;

export const FONT_FAMILY_CSS: Record<FontFamily, string> = {
  hand: '"Patrick Hand", "Segoe Print", "Comic Sans MS", cursive',
  normal: '"Nunito", system-ui, sans-serif',
  code: '"JetBrains Mono", ui-monospace, Consolas, monospace',
};

export const FONT_SIZES = [
  { label: "S", value: 16 },
  { label: "M", value: 20 },
  { label: "L", value: 28 },
  { label: "XL", value: 36 },
] as const;

export const STROKE_WIDTHS = [1, 2, 4] as const;
export const ROUGHNESS_LEVELS = [0, 1, 2] as const;

export const DEFAULT_STYLE: ItemStyle = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  opacity: 100,
  roundness: true,
  fontFamily: "hand",
  fontSize: 20,
  textAlign: "left",
  startArrowhead: null,
  endArrowhead: "arrow",
  arrowType: "sharp",
  lineCurved: false,
  simulatePressure: true,
};

export const DEFAULT_VIEW_BACKGROUND = "#ffffff";
