import { FONT_FAMILY_CSS, LINE_HEIGHT } from "../scene/constants";
import type { FontFamily, TextElement } from "../scene/types";

let ctx: CanvasRenderingContext2D | null | undefined;

function getCtx(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  if (typeof document === "undefined") return (ctx = null);
  ctx = document.createElement("canvas").getContext("2d");
  return ctx;
}

export const fontString = (fontSize: number, family: FontFamily): string => `${fontSize}px ${FONT_FAMILY_CSS[family]}`;

/** Width of one line. Falls back to an estimate when there is no canvas (unit tests, SSR). */
export function textWidth(str: string, fontSize: number, family: FontFamily): number {
  const c = getCtx();
  if (!c) return str.length * fontSize * 0.55;
  c.font = fontString(fontSize, family);
  return c.measureText(str).width;
}

function breakWord(word: string, max: number, fontSize: number, family: FontFamily): string[] {
  const parts: string[] = [];
  let cur = "";
  for (const ch of word) {
    if (cur !== "" && textWidth(cur + ch, fontSize, family) > max) {
      parts.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

/** Greedy word wrap of one paragraph; words longer than the width are broken by character. */
export function wrapParagraph(par: string, max: number, fontSize: number, family: FontFamily): string[] {
  if (par === "") return [""];
  const lines: string[] = [];
  let line = "";
  for (const word of par.split(" ")) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (textWidth(candidate, fontSize, family) <= max) {
      line = candidate;
      continue;
    }
    if (line !== "") {
      lines.push(line);
      line = "";
    }
    if (textWidth(word, fontSize, family) <= max) {
      line = word;
    } else {
      const parts = breakWord(word, max, fontSize, family);
      lines.push(...parts.slice(0, -1));
      line = parts[parts.length - 1] ?? "";
    }
  }
  lines.push(line);
  return lines;
}

export interface TextMetrics {
  /** Width of the widest line. */
  width: number;
  height: number;
  lines: string[];
}

/** Lays text out: explicit newlines always break, and with `maxWidth` lines also wrap. */
export function layoutText(
  text: string,
  fontSize: number,
  family: FontFamily,
  lineHeight = LINE_HEIGHT,
  maxWidth: number | null = null,
): TextMetrics {
  const lines = text.split("\n").flatMap((p) => (maxWidth === null ? [p] : wrapParagraph(p, maxWidth, fontSize, family)));
  let width = 0;
  for (const line of lines) width = Math.max(width, textWidth(line, fontSize, family));
  return { width: Math.ceil(width), height: Math.ceil(lines.length * fontSize * lineHeight), lines };
}

/** Measures text that fits itself (no wrapping). */
export function measureText(text: string, fontSize: number, family: FontFamily, lineHeight = LINE_HEIGHT): TextMetrics {
  return layoutText(text, fontSize, family, lineHeight, null);
}

/** New size for a free-standing text element after its text or font changed (bound text is laid out by its container). */
export function layoutPatchForText(el: TextElement, overrides: Partial<TextElement> = {}): Partial<TextElement> {
  const t = { ...el, ...overrides };
  if (t.wrapWidth === null) {
    const m = measureText(t.text, t.fontSize, t.fontFamily, t.lineHeight);
    return { width: m.width, height: m.height };
  }
  const m = layoutText(t.text, t.fontSize, t.fontFamily, t.lineHeight, t.wrapWidth);
  return { width: t.wrapWidth, height: m.height };
}
