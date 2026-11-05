import { FONT_FAMILY_CSS, LINE_HEIGHT } from "../scene/constants";
import type { FontFamily } from "../scene/types";

let ctx: CanvasRenderingContext2D | null | undefined;

function getCtx(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  if (typeof document === "undefined") return (ctx = null);
  ctx = document.createElement("canvas").getContext("2d");
  return ctx;
}

export const fontString = (fontSize: number, family: FontFamily): string => `${fontSize}px ${FONT_FAMILY_CSS[family]}`;

export interface TextMetrics {
  width: number;
  height: number;
  lines: string[];
}

/** Measures (multi-line) text. Falls back to an estimate when there is no canvas (unit tests, SSR). */
export function measureText(text: string, fontSize: number, family: FontFamily, lineHeight = LINE_HEIGHT): TextMetrics {
  const lines = text.split("\n");
  const c = getCtx();
  let width = 0;
  if (c) {
    c.font = fontString(fontSize, family);
    for (const line of lines) width = Math.max(width, c.measureText(line).width);
  } else {
    for (const line of lines) width = Math.max(width, line.length * fontSize * 0.55);
  }
  return { width: Math.ceil(width), height: Math.ceil(lines.length * fontSize * lineHeight), lines };
}
